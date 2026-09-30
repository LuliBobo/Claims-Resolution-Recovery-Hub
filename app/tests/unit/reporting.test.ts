import { describe, expect, it } from "vitest";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { computeInsightRows, type InsightSourceCase } from "@/server/jobs/recompute-insights";
import { buildWeeklyReport, previousWeekWindow, type ReportData } from "@/server/jobs/weekly-report";

const NOW = new Date("2026-09-30T12:00:00Z"); // a Wednesday
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const c = (over: Partial<InsightSourceCase> = {}): InsightSourceCase => ({
  createdAt: daysAgo(1), caseType: "damaged_delivery", sku: "V1", supplier: "S", carrier: "DPD", warehouse: "W1", ...over,
});

describe("computeInsightRows", () => {
  it("groups by sku/carrier/supplier/warehouse/issue type and counts all-time frequency", () => {
    const rows = computeInsightRows([c(), c(), c({ sku: "V2" }), c({ caseType: "wrong_item" })], NOW);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ sku: "V1", issueType: "damaged_delivery", frequency: 2 });
  });
  it("trend compares the last 30 days with the 30 before", () => {
    const up = computeInsightRows([c({ createdAt: daysAgo(5) }), c({ createdAt: daysAgo(6) }), c({ createdAt: daysAgo(40) })], NOW)[0];
    const down = computeInsightRows([c({ createdAt: daysAgo(5) }), c({ createdAt: daysAgo(40) }), c({ createdAt: daysAgo(45) })], NOW)[0];
    const stable = computeInsightRows([c({ createdAt: daysAgo(5) }), c({ createdAt: daysAgo(40) })], NOW)[0];
    expect([up.trendDirection, down.trendDirection, stable.trendDirection]).toEqual(["up", "down", "stable"]);
  });
  it("a group with only old cases is stable, and null dimensions group together", () => {
    const rows = computeInsightRows([c({ createdAt: daysAgo(200), carrier: null }), c({ createdAt: daysAgo(300), carrier: null })], NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ carrier: null, frequency: 2, trendDirection: "stable" });
  });
  it("returns nothing for no cases", () => {
    expect(computeInsightRows([], NOW)).toEqual([]);
  });
});

describe("previousWeekWindow", () => {
  it("returns the last full Monday-Sunday week (UTC)", () => {
    const w = previousWeekWindow(NOW); // Wed 2026-09-30
    expect(w.start.toISOString()).toBe("2026-09-21T00:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-09-28T00:00:00.000Z");
  });
  it("on a Monday (when the cron fires) reports the week that just ended", () => {
    const w = previousWeekWindow(new Date("2026-09-28T06:00:00Z"));
    expect(w.start.toISOString()).toBe("2026-09-21T00:00:00.000Z");
  });
  it("on a Sunday the week is still in progress, so the prior one is reported", () => {
    const w = previousWeekWindow(new Date("2026-09-27T23:59:00Z"));
    expect(w.start.toISOString()).toBe("2026-09-14T00:00:00.000Z");
  });
});

describe("buildWeeklyReport", () => {
  const w = previousWeekWindow(NOW);
  const inWeek = new Date("2026-09-23T10:00:00Z");
  const data: ReportData = {
    cases: [
      { createdAt: inWeek, status: "resolved", caseType: "damaged_delivery", resolvedAt: inWeek },
      { createdAt: inWeek, status: "new", caseType: "other", resolvedAt: null },
      { createdAt: new Date("2026-08-01T00:00:00Z"), status: "resolved", caseType: "other", resolvedAt: null },
    ],
    proposals: [{ createdAt: inWeek }, { createdAt: new Date("2026-08-01T00:00:00Z") }],
    approvals: [
      { decision: "approved", decisionTime: inWeek },
      { decision: "rejected", decisionTime: null },
      { decision: "pending", decisionTime: null },
    ],
    drafts: [{ status: "sent", sentAt: inWeek, approvedAt: inWeek, estimatedRecoverableValue: 40 }, { status: "sent", sentAt: null, approvedAt: null, estimatedRecoverableValue: 10 }],
  };
  const md = buildWeeklyReport(data, w);

  it("counts only records with a timestamp inside the week", () => {
    expect(md).toContain("Cases opened: 2");
    expect(md).toContain("Cases resolved: 1");
    expect(md).toContain("Resolution proposals generated: 1");
    expect(md).toContain("Approvals decided: 1 (approved 1, rejected 0)");
    expect(md).toContain("Recovery drafts sent: 1, estimated value 40.00");
  });
  it("labels records missing a timestamp as 'timestamp unavailable' rather than dropping them silently", () => {
    expect(md).toContain("1 resolved case(s) have no resolved-at timestamp; timestamp unavailable");
    expect(md).toContain("1 decided approval(s) have no decision time; timestamp unavailable");
    expect(md).toContain("1 sent recovery draft(s) have no sent-at timestamp; timestamp unavailable");
  });
  it("says 'none' when there are no gaps", () => {
    expect(buildWeeklyReport({ cases: [], proposals: [], approvals: [], drafts: [] }, w)).toContain("## Data gaps\n- none");
  });
});

describe("isAuthorizedCron", () => {
  const req = (auth?: string) => new Request("http://x/api/cron", { headers: auth ? { authorization: auth } : {} });
  it("fails closed when no secret is configured", () => {
    expect(isAuthorizedCron(req("Bearer "), "")).toBe(false);
    expect(isAuthorizedCron(req(), undefined)).toBe(false);
  });
  it("accepts only the exact bearer secret", () => {
    expect(isAuthorizedCron(req("Bearer s3cret"), "s3cret")).toBe(true);
    expect(isAuthorizedCron(req("Bearer s3cret2"), "s3cret")).toBe(false);
    expect(isAuthorizedCron(req("s3cret"), "s3cret")).toBe(false);
    expect(isAuthorizedCron(req(), "s3cret")).toBe(false);
  });
});
