import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { recomputeInsights } from "@/server/jobs/recompute-insights";
import { generateWeeklyReport, previousWeekWindow } from "@/server/jobs/weekly-report";
import { getOperationsSummary } from "@/server/reporting/operations-summary";

const NOW = new Date("2026-09-30T12:00:00Z");
const SKU = "JOBTEST-SKU";
const created: { cases: string[]; order?: string; shipment?: string } = { cases: [] };

async function mkCase(status: "new" | "resolved" | "escalated" | "closed", extra = {}) {
  const c = await db.customerCase.create({
    data: {
      source: "email", customerName: "Job Test", complaintText: "x", caseType: "damaged_delivery", status,
      linkedOrderId: created.order, linkedShipmentId: created.shipment, ...extra,
    },
  });
  created.cases.push(c.id);
  return c;
}

beforeAll(async () => {
  const o = await db.order.create({ data: { orderDate: NOW, salesChannel: "web", customerName: "J", sku: SKU, productName: "P", quantity: 1, orderValue: 10, supplier: "Sup" } });
  const s = await db.shipment.create({ data: { linkedOrderId: o.id, carrier: "JOBCARRIER", trackingNumber: "T", warehouse: "WJ" } });
  created.order = o.id;
  created.shipment = s.id;
});
afterAll(async () => {
  await db.customerCase.deleteMany({ where: { id: { in: created.cases } } });
  await db.shipment.delete({ where: { id: created.shipment } });
  await db.order.delete({ where: { id: created.order } });
  await db.insightRecord.deleteMany();
  await db.weeklyReport.deleteMany({ where: { generatedBy: "jobtest" } });
  await db.$disconnect();
});

describe("recomputeInsights", () => {
  it("aggregates only resolved/escalated cases and fully replaces the prior set", async () => {
    await db.insightRecord.create({ data: { issueType: "stale row that must disappear", frequency: 99 } });
    await mkCase("resolved");
    await mkCase("resolved");
    await mkCase("escalated");
    await mkCase("new"); // open: excluded
    await mkCase("closed"); // closed but not resolved/escalated: excluded

    await recomputeInsights(NOW);
    const all = await db.insightRecord.findMany();
    expect(all.find((r) => r.issueType.startsWith("stale"))).toBeUndefined();
    const mine = all.filter((r) => r.sku === SKU);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ carrier: "JOBCARRIER", supplier: "Sup", warehouse: "WJ", issueType: "damaged_delivery", frequency: 3 });
  });

  it("is idempotent: a second run yields the same set, not duplicates", async () => {
    await recomputeInsights(NOW);
    const first = await db.insightRecord.count();
    await recomputeInsights(NOW);
    expect(await db.insightRecord.count()).toBe(first);
  });

  it("concurrent runs (cron + manual) never duplicate rows", async () => {
    await Promise.all(Array.from({ length: 5 }, () => recomputeInsights(NOW)));
    const rows = await db.insightRecord.findMany({ where: { sku: SKU } });
    expect(rows).toHaveLength(1);
  });
});

describe("generateWeeklyReport", () => {
  it("stores the report for the last full week and replaces it on regeneration", async () => {
    const w = previousWeekWindow(NOW);
    const a = await generateWeeklyReport("jobtest", NOW);
    expect(a.weekStart).toEqual(w.start);
    expect(a.markdown).toContain("# Weekly report: 2026-09-21 to 2026-09-27");
    const b = await generateWeeklyReport("jobtest", NOW);
    expect(b.id).toBe(a.id);
    expect(await db.weeklyReport.count({ where: { weekStart: w.start } })).toBe(1);
  });
});

describe("getOperationsSummary", () => {
  it("counts only open cases (status not resolved or closed)", async () => {
    const before = await getOperationsSummary();
    await mkCase("new");
    await mkCase("in_review" as never);
    await mkCase("resolved");
    await mkCase("closed");
    const after = await getOperationsSummary();
    expect(after.openCases - before.openCases).toBe(2);
  });
});
