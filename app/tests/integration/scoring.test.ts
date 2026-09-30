import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuthError, type Actor } from "@/server/auth";
import { db } from "@/server/db";
import { CARRIER_CLAIMS_SOP_NAME } from "@/server/evidence/carrier-claims-gate";
import { getWorkflowScore, ScoreError, setScoreOverride } from "@/server/scoring";
import { updateCase } from "@/server/workflows/case-management";

const agent: Actor = { id: "a", email: "agent@test.io", name: "A", role: "agent" };
const reviewer: Actor = { id: "r", email: "reviewer@test.io", name: "R", role: "reviewer" };

const caseIds: string[] = [];
let policyId: string, ruleId: string, orderId: string, bigOrderId: string, shipmentId: string;

beforeAll(async () => {
  policyId = (await db.policyDocument.create({ data: { name: CARRIER_CLAIMS_SOP_NAME, documentType: "carrier_agreement" } })).id;
  ruleId = (await db.rule.create({ data: { ruleName: "score test", triggerType: "damaged_delivery", linkedPolicyDocumentId: policyId } })).id;
  orderId = (await db.order.create({ data: { orderDate: new Date(), salesChannel: "web", customerName: "S", sku: "S", productName: "P", quantity: 1, orderValue: 20 } })).id;
  bigOrderId = (await db.order.create({ data: { orderDate: new Date(), salesChannel: "web", customerName: "S", sku: "S2", productName: "P", quantity: 1, orderValue: 600 } })).id;
  shipmentId = (await db.shipment.create({ data: { linkedOrderId: bigOrderId, carrier: "DPD", trackingNumber: "SC1" } })).id;
});
afterAll(async () => {
  await db.customerCase.deleteMany({ where: { id: { in: caseIds } } });
  await db.shipment.delete({ where: { id: shipmentId } });
  await db.order.deleteMany({ where: { id: { in: [orderId, bigOrderId] } } });
  await db.rule.delete({ where: { id: ruleId } });
  await db.policyDocument.delete({ where: { id: policyId } });
  await db.$disconnect();
});

async function mkCase(data: Record<string, unknown>) {
  const c = await db.customerCase.create({ data: { source: "email", customerName: "Score Test", complaintText: "x", ...data } as never });
  caseIds.push(c.id);
  return c;
}
// damaged delivery, no evidence (3), urgent (3), order 600 (3), recovery w/ carrier but no evidence (2), explicit policy (0) = 11
const escalateCase = () => mkCase({ caseType: "damaged_delivery", priority: "urgent", linkedOrderId: bigOrderId, linkedShipmentId: shipmentId, recoveryNeeded: true });

describe("getWorkflowScore", () => {
  it("scores a real case from current data", async () => {
    const c = await escalateCase();
    const s = await getWorkflowScore(c.id);
    expect(Object.fromEntries(s.factors.map((f) => [f.key, f.score]))).toEqual({
      evidenceCompleteness: 3, policyClarity: 0, customerImpact: 3, businessExposure: 3, recoveryPotential: 2,
    });
    expect(s).toMatchObject({ total: 11, route: "escalate_no_auto_closure" });
  });

  it("is recomputed on every read: fixing the evidence lowers the score with no regenerate", async () => {
    const c = await escalateCase();
    const before = (await getWorkflowScore(c.id)).total;
    for (const [category, photoSubject] of [["shipping_label", null], ["photo_evidence", "item"], ["photo_evidence", "outer_carton"]] as const) {
      await db.attachment.create({ data: { linkedCaseId: c.id, fileName: "f", declaredContentType: "image/png", attachmentCategory: category, photoSubject, evidenceStatus: "sufficient", storageRef: "x" } });
    }
    const after = await getWorkflowScore(c.id);
    expect(after.factors.find((f) => f.key === "evidenceCompleteness")!.score).toBe(0);
    expect(after.factors.find((f) => f.key === "recoveryPotential")!.score).toBe(3);
    expect(after.total).toBe(before - 3 + 1);
  });

  it("a case with no rule for its type scores policy clarity 3", async () => {
    const c = await mkCase({ caseType: "missing_item" });
    expect((await getWorkflowScore(c.id)).factors.find((f) => f.key === "policyClarity")!.score).toBe(3);
  });
});

describe("operator overrides", () => {
  it("need reviewer/admin and a reason; are audited; and can be reset", async () => {
    const c = await mkCase({ caseType: "other", priority: "low" });
    await expect(setScoreOverride(agent, c.id, "customerImpact", 3, "VIP")).rejects.toBeInstanceOf(AuthError);
    await expect(setScoreOverride(null, c.id, "customerImpact", 3, "VIP")).rejects.toBeInstanceOf(AuthError);
    await expect(setScoreOverride(reviewer, c.id, "customerImpact", 3, "  ")).rejects.toBeInstanceOf(ScoreError);

    const s = await setScoreOverride(reviewer, c.id, "customerImpact", 3, "VIP customer");
    expect(s.factors.find((f) => f.key === "customerImpact")).toMatchObject({ score: 3, derivedScore: 0 });
    const ev = await db.auditEvent.findFirstOrThrow({ where: { linkedCaseId: c.id, action: "score_override_set" } });
    expect([ev.previousState, ev.newState, ev.notes, ev.actor]).toEqual([null, "customerImpact=3", "VIP customer", "reviewer@test.io"]);

    const reset = await setScoreOverride(reviewer, c.id, "customerImpact", null, "");
    expect(reset.factors.find((f) => f.key === "customerImpact")!.override).toBeNull();
    expect((await db.auditEvent.findFirstOrThrow({ where: { linkedCaseId: c.id, action: "score_override_cleared" } })).previousState).toBe("customerImpact=3");
    expect((await db.customerCase.findUniqueOrThrow({ where: { id: c.id } })).scoreOverrides).toBeNull();
  });

  it("concurrent overrides of different factors both persist (no lost update)", async () => {
    for (let round = 0; round < 5; round++) {
      const c = await mkCase({ caseType: "other" });
      await Promise.all([
        setScoreOverride(reviewer, c.id, "customerImpact", 2, "a"),
        setScoreOverride(reviewer, c.id, "businessExposure", 3, "b"),
        setScoreOverride(reviewer, c.id, "policyClarity", 1, "c"),
      ]);
      const s = await getWorkflowScore(c.id);
      expect(s.factors.filter((f) => f.override).map((f) => f.key).sort()).toEqual(["businessExposure", "customerImpact", "policyClarity"]);
    }
  });

  it("a stored override can push a case into a higher route", async () => {
    const c = await mkCase({ caseType: "other", priority: "low" });
    // derived: no rule for "other" -> policy 3, no linked order -> exposure 1, rest 0 = 4
    expect(await getWorkflowScore(c.id)).toMatchObject({ total: 4, route: "quick_review" });
    await setScoreOverride(reviewer, c.id, "customerImpact", 3, "VIP");
    expect(await getWorkflowScore(c.id)).toMatchObject({ total: 7, route: "request_evidence_or_supervisor_check" });
    await setScoreOverride(reviewer, c.id, "evidenceCompleteness", 3, "x");
    expect(await getWorkflowScore(c.id)).toMatchObject({ total: 10, route: "human_approval_required" });
    await setScoreOverride(reviewer, c.id, "businessExposure", 3, "x");
    expect(await getWorkflowScore(c.id)).toMatchObject({ total: 12, route: "escalate_no_auto_closure" });
  });
});

describe("escalate route: no closure by an agent", () => {
  it("blocks an agent from resolving or closing, but not a reviewer", async () => {
    const c = await escalateCase();
    await expect(updateCase(agent, c.id, { status: "resolved" })).rejects.toThrow(/reviewer or admin must close/);
    await expect(updateCase(agent, c.id, { status: "closed" })).rejects.toThrow(/reviewer or admin must close/);
    expect((await db.customerCase.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("new");
    await updateCase(agent, c.id, { status: "in_review" }); // other transitions stay open to agents
    expect((await updateCase(reviewer, c.id, { status: "resolved" })).status).toBe("resolved");
  });

  it("does not restrict agents on lower routes", async () => {
    const c = await mkCase({ caseType: "other", priority: "low", linkedOrderId: orderId });
    expect((await updateCase(agent, c.id, { status: "resolved" })).status).toBe("resolved");
  });

  it("an operator override that lowers the score re-opens closure to agents", async () => {
    const c = await escalateCase();
    await setScoreOverride(reviewer, c.id, "businessExposure", 0, "value mis-entered"); // 11 -> 8
    expect(await getWorkflowScore(c.id)).toMatchObject({ total: 8, route: "human_approval_required" });
    expect((await updateCase(agent, c.id, { status: "closed" })).status).toBe("closed");
  });
});
