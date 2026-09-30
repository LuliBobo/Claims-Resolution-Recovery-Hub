import { describe, expect, it } from "vitest";
import { computeFactors, EXPOSURE_THRESHOLDS, routeFor, scoreCase, type ScoreInputs } from "@/server/scoring/workflow-score";

const base: ScoreInputs = {
  evidence: { gateApplies: false, gateMissing: 0, attachmentCount: 0, sufficientCount: 0, unresolvedCount: 0, ruleRequiresEvidence: false },
  policy: { matchedRuleCount: 1, distinctResolutions: 1, allLinkedToPolicy: true },
  priority: "low",
  orderValue: 10,
  recovery: { needed: false, hasCounterparty: false },
};
const with_ = (over: Partial<ScoreInputs>): ScoreInputs => ({ ...base, ...over });
const score = (i: ScoreInputs, key: string) => computeFactors(i).find((f) => f.key === key)!.score;

describe("routeFor: the four bands and their boundaries", () => {
  it.each([[0, "quick_review"], [4, "quick_review"], [5, "request_evidence_or_supervisor_check"], [7, "request_evidence_or_supervisor_check"], [8, "human_approval_required"], [10, "human_approval_required"], [11, "escalate_no_auto_closure"], [15, "escalate_no_auto_closure"]])(
    "total %i -> %s",
    (total, route) => expect(routeFor(total)).toBe(route),
  );
});

describe("evidence completeness", () => {
  it("with the carrier gate, equals the number of missing required items", () => {
    for (const m of [0, 1, 2, 3]) expect(score(with_({ evidence: { ...base.evidence, gateApplies: true, gateMissing: m } }), "evidenceCompleteness")).toBe(m);
  });
  it("without the gate: nothing attached is a material gap only if a rule requires evidence", () => {
    expect(score(base, "evidenceCompleteness")).toBe(0);
    expect(score(with_({ evidence: { ...base.evidence, ruleRequiresEvidence: true } }), "evidenceCompleteness")).toBe(2);
  });
  it("without the gate: unresolved attachments are a minor gap if some evidence is sufficient, else material", () => {
    const e = { ...base.evidence, attachmentCount: 2, unresolvedCount: 1 };
    expect(score(with_({ evidence: { ...e, sufficientCount: 1 } }), "evidenceCompleteness")).toBe(1);
    expect(score(with_({ evidence: { ...e, sufficientCount: 0 } }), "evidenceCompleteness")).toBe(2);
    expect(score(with_({ evidence: { ...e, sufficientCount: 2, unresolvedCount: 0 } }), "evidenceCompleteness")).toBe(0);
  });
});

describe("policy clarity", () => {
  it("no rule 3, disagreeing rules 2, unlinked rule 1, policy-backed rule 0", () => {
    expect(score(with_({ policy: { matchedRuleCount: 0, distinctResolutions: 0, allLinkedToPolicy: false } }), "policyClarity")).toBe(3);
    expect(score(with_({ policy: { matchedRuleCount: 2, distinctResolutions: 2, allLinkedToPolicy: true } }), "policyClarity")).toBe(2);
    expect(score(with_({ policy: { matchedRuleCount: 1, distinctResolutions: 1, allLinkedToPolicy: false } }), "policyClarity")).toBe(1);
    expect(score(base, "policyClarity")).toBe(0);
  });
});

describe("customer impact and business exposure", () => {
  it("maps priority 1:1", () => {
    expect(["low", "medium", "high", "urgent"].map((p) => score(with_({ priority: p as never }), "customerImpact"))).toEqual([0, 1, 2, 3]);
  });
  it("steps up at the thresholds; unknown value is manageable", () => {
    const [a, b, c] = EXPOSURE_THRESHOLDS;
    expect([a - 0.01, a, b - 0.01, b, c - 0.01, c].map((v) => score(with_({ orderValue: v }), "businessExposure"))).toEqual([0, 1, 1, 2, 2, 3]);
    expect(score(with_({ orderValue: null }), "businessExposure")).toBe(1);
  });
});

describe("recovery potential", () => {
  it("none / uncertain / probable / strong", () => {
    expect(score(base, "recoveryPotential")).toBe(0);
    expect(score(with_({ recovery: { needed: true, hasCounterparty: false } }), "recoveryPotential")).toBe(1);
    expect(score(with_({ recovery: { needed: true, hasCounterparty: true } }), "recoveryPotential")).toBe(2); // no sufficient evidence
    const ok = { ...base.evidence, attachmentCount: 1, sufficientCount: 1 };
    expect(score(with_({ recovery: { needed: true, hasCounterparty: true }, evidence: ok }), "recoveryPotential")).toBe(3);
    const gate = { ...base.evidence, gateApplies: true, gateMissing: 0 };
    expect(score(with_({ recovery: { needed: true, hasCounterparty: true }, evidence: gate }), "recoveryPotential")).toBe(3);
  });
});

describe("scoreCase", () => {
  it("totals factors, is deterministic, and stays within 0-15", () => {
    const worst = with_({
      evidence: { ...base.evidence, gateApplies: true, gateMissing: 3 },
      policy: { matchedRuleCount: 0, distinctResolutions: 0, allLinkedToPolicy: false },
      priority: "urgent", orderValue: 9999, recovery: { needed: true, hasCounterparty: true },
    });
    const a = scoreCase(worst);
    expect(a.total).toBe(3 + 3 + 3 + 3 + 2);
    expect(a.route).toBe("escalate_no_auto_closure");
    expect(scoreCase(worst)).toEqual(a);
    expect(scoreCase(base).total).toBe(0);
  });
  it("applies operator overrides, keeps the derived value visible, and re-routes", () => {
    const o = { customerImpact: { score: 3 as const, reason: "VIP", by: "r@x.io", at: "2026-09-30T00:00:00Z" } };
    const s = scoreCase(base, o);
    const f = s.factors.find((x) => x.key === "customerImpact")!;
    expect(f).toMatchObject({ score: 3, derivedScore: 0, level: "critical" });
    expect(f.reason).toContain("Operator override: VIP");
    expect(s.total).toBe(3);
  });
});
