import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AuthError, type Actor } from "@/server/auth";
import { db } from "@/server/db";
import { DemoDisabledError } from "@/server/demo/config";
import { DemoError, demoAddCartonPhoto, getDemoState, resetDemo } from "@/server/demo/reset";
import { getMissingEvidence } from "@/server/workflows/customer-message";
import { evaluateGateForCase } from "@/server/workflows/proposal-generation";
import { reviewApproval } from "@/server/workflows/review-approval";
import { getWorkflowScore } from "@/server/scoring";
import { SEED_POLICIES } from "@/server/reference-data/seed-data";

const admin: Actor = { id: "ad", email: "admin@test.io", name: "Ad", role: "admin" };
const agent: Actor = { id: "a", email: "agent@test.io", name: "A", role: "agent" };
const reviewer: Actor = { id: "r", email: "reviewer@test.io", name: "R", role: "reviewer" };

const saved = process.env.DEMO_MODE;
// Same cleanup before and after, so rows left by a crashed run cannot skew the next one.
async function cleanup() {
  await db.customerCase.deleteMany({ where: { OR: [{ isDemo: true }, { customerName: "Not A Demo Case" }] } });
  await db.shipment.deleteMany({ where: { isDemo: true } });
  await db.order.deleteMany({ where: { isDemo: true } });
  await db.insightRecord.deleteMany();
}
beforeAll(async () => {
  process.env.DEMO_MODE = "1";
  await cleanup();
});
afterEach(async () => {
  process.env.DEMO_MODE = "1";
});
afterAll(async () => {
  await cleanup();
  const names = SEED_POLICIES.map((p) => p.name);
  await db.rule.deleteMany({ where: { linkedPolicyDocument: { name: { in: names } } } });
  await db.policyDocument.deleteMany({ where: { name: { in: names } } });
  if (saved === undefined) delete process.env.DEMO_MODE;
  else process.env.DEMO_MODE = saved;
  await db.$disconnect();
});

const demoCase = (ref: string) => db.customerCase.findFirstOrThrow({ where: { isDemo: true, orderReference: ref } });

describe("access", () => {
  it("nothing works unless DEMO_MODE=1", async () => {
    process.env.DEMO_MODE = "0";
    await expect(resetDemo(admin)).rejects.toBeInstanceOf(DemoDisabledError);
    await expect(demoAddCartonPhoto(admin)).rejects.toBeInstanceOf(DemoDisabledError);
  });
  it("reset is admin only", async () => {
    await expect(resetDemo(reviewer)).rejects.toBeInstanceOf(AuthError);
    await expect(resetDemo(agent)).rejects.toBeInstanceOf(AuthError);
    await expect(resetDemo(null)).rejects.toBeInstanceOf(AuthError);
  });
  it("is not loaded before the first reset, and the shortcut says so", async () => {
    expect((await getDemoState()).loaded).toBe(false);
    await expect(demoAddCartonPhoto(admin)).rejects.toThrow(/Load the demo data first/);
  });
});

describe("the known starting state", () => {
  it("builds the flagship Spanish vase case exactly as the script describes", async () => {
    await resetDemo(admin);
    const vase = await demoCase("DEMO-VASE-0001");
    expect(vase).toMatchObject({ customerLanguage: "es", caseType: "damaged_delivery", priority: "high", classificationConfidence: 0.96, recoveryNeeded: true, isDemo: true });
    expect(vase.complaintText).toMatch(/jarrón/);
    expect(vase.internalEnglishSummary).toMatch(/vase/);

    // two photos present, outer carton missing, so the real evidence gate overrides the recommendation
    const atts = await db.attachment.findMany({ where: { linkedCaseId: vase.id }, orderBy: { createdAt: "asc" } });
    expect(atts.map((a) => [a.attachmentCategory, a.photoSubject, a.evidenceStatus])).toEqual([["photo_evidence", "item", "sufficient"], ["shipping_label", null, "sufficient"]]);
    const gate = await evaluateGateForCase(vase.id);
    expect(gate).toMatchObject({ applies: true, evidenceComplete: false, missing: ["outer carton photo"] });
    const proposal = await db.resolutionProposal.findUniqueOrThrow({ where: { id: vase.currentResolutionProposalId! } });
    expect(proposal).toMatchObject({ recommendation: "Request Missing Evidence", evidenceGateApplied: true, status: "pending_approval" });
    expect(proposal.customerReplyDraft).toMatch(/Hola Lucía/);
    expect((proposal.citations as unknown[]).length).toBeGreaterThan(0); // policy excerpts, verbatim from the sample PDFs

    // carrier claim draft in English, and the Spanish evidence request ready for a person to send
    const draft = await db.recoveryDraft.findFirstOrThrow({ where: { linkedCaseId: vase.id } });
    expect(draft).toMatchObject({ counterpartyType: "carrier", counterpartyName: "DPD", status: "pending_approval" });
    expect(draft.draftText).toMatch(/^To: DPD Customer Claims/);
    const msg = await db.customerMessageDraft.findFirstOrThrow({ where: { linkedCaseId: vase.id, status: "draft" } });
    expect(msg.language).toBe("es");
    expect((await getMissingEvidence(vase.id)).map((i) => i.text)).toEqual(["Outer carton photo (missing or not clear enough)"]);
    expect((await getDemoState()).state).toEqual({ cartonAdded: false, approvalsDecided: false });
  });

  it("builds the English wrong-item case with a supplier claim and a replacement that needs no gate", async () => {
    const wrong = await demoCase("DEMO-WRONG-0001");
    expect(wrong).toMatchObject({ customerLanguage: "en", caseType: "wrong_item", priority: "medium" });
    const p = await db.resolutionProposal.findUniqueOrThrow({ where: { id: wrong.currentResolutionProposalId! } });
    expect(p).toMatchObject({ recommendation: "Arrange Replacement Shipment", evidenceGateApplied: false });
    expect((p.citations as unknown[]).length).toBeGreaterThan(0);
    const d = await db.recoveryDraft.findFirstOrThrow({ where: { linkedCaseId: wrong.id } });
    expect(d).toMatchObject({ counterpartyType: "supplier", counterpartyName: "Nordic Homeware Trading s.r.o." });
  });

  it("makes the repeated-issue pattern visible in analytics: same SKU, same carrier, trend up", async () => {
    const row = await db.insightRecord.findFirstOrThrow({ where: { sku: "DEMO-VASE-01", carrier: "DPD" } });
    expect(row).toMatchObject({ issueType: "damaged_delivery", frequency: 3, trendDirection: "up" });
  });

  it("labels demo cases apart from real ones", async () => {
    expect(await db.customerCase.count({ where: { isDemo: true } })).toBe(5);
    expect(await db.order.count({ where: { isDemo: true } })).toBe(5);
    expect(await db.shipment.count({ where: { isDemo: true } })).toBe(5);
  });
});

describe("the step 6 shortcut", () => {
  it("adds the carton photo through the real workflow: the gate clears, the old proposal is superseded, the score factors move", async () => {
    const vase = await demoCase("DEMO-VASE-0001");
    const factors = async () => Object.fromEntries((await getWorkflowScore(vase.id)).factors.map((f) => [f.key, f.score]));
    const before = await factors();
    const oldId = vase.currentResolutionProposalId!;

    await demoAddCartonPhoto(agent); // any signed-in role may drive the shortcut
    const gate = await evaluateGateForCase(vase.id);
    expect(gate.evidenceComplete).toBe(true);
    const fresh = await db.customerCase.findUniqueOrThrow({ where: { id: vase.id } });
    expect(fresh.currentResolutionProposalId).not.toBe(oldId);
    expect(await db.resolutionProposal.findUniqueOrThrow({ where: { id: oldId } })).toMatchObject({ status: "superseded" });
    const next = await db.resolutionProposal.findUniqueOrThrow({ where: { id: fresh.currentResolutionProposalId! } });
    expect(next).toMatchObject({ recommendation: "Arrange Replacement Shipment", evidenceGateApplied: false, status: "pending_approval" });
    expect(next.customerReplyDraft).toMatch(/Gracias por la foto/);
    // Evidence completeness improves; recovery potential rises because the claim is now fully supported.
    // (The total stays at 6 for this case: the two moves offset each other.)
    const after = await factors();
    expect([before.evidenceCompleteness, after.evidenceCompleteness]).toEqual([1, 0]);
    expect([before.recoveryPotential, after.recoveryPotential]).toEqual([2, 3]);
    expect(await getMissingEvidence(vase.id)).toEqual([]);
    expect((await getDemoState()).state.cartonAdded).toBe(true);
    // the attachment is a real, downloadable row
    const a = await db.attachment.findFirstOrThrow({ where: { linkedCaseId: vase.id, photoSubject: "outer_carton" } });
    expect(a.sniffedContentType).toBe("image/png");
    expect(await db.attachmentBlob.count({ where: { attachmentId: a.id } })).toBe(1);
  });

  it("cannot be run twice", async () => {
    await expect(demoAddCartonPhoto(admin)).rejects.toBeInstanceOf(DemoError);
  });
});

describe("reset", () => {
  it("restores the known starting state after the presenter has acted, and is idempotent", async () => {
    const vase = await demoCase("DEMO-VASE-0001");
    const approvals = await db.humanApproval.findMany({ where: { linkedCaseId: vase.id, decision: "pending" } });
    for (const a of approvals) await reviewApproval(reviewer, a.id, "approved", "demo");
    expect((await getDemoState()).state).toEqual({ cartonAdded: true, approvalsDecided: true });

    await resetDemo(admin);
    await resetDemo(admin);
    expect((await getDemoState()).state).toEqual({ cartonAdded: false, approvalsDecided: false });
    expect(await db.customerCase.count({ where: { isDemo: true } })).toBe(5);
    expect(await db.order.count({ where: { isDemo: true } })).toBe(5);
    const again = await demoCase("DEMO-VASE-0001");
    expect(again.id).not.toBe(vase.id);
    expect((await evaluateGateForCase(again.id)).missing).toEqual(["outer carton photo"]);
    expect(await db.humanApproval.count({ where: { linkedCaseId: again.id, decision: "pending" } })).toBeGreaterThanOrEqual(2);
    expect(await db.insightRecord.count({ where: { sku: "DEMO-VASE-01" } })).toBe(1);
  });

  it("never touches records that are not part of the demo", async () => {
    const real = await db.customerCase.create({ data: { source: "email", customerName: "Not A Demo Case", complaintText: "real", caseType: "other" } });
    await resetDemo(admin);
    expect(await db.customerCase.findUnique({ where: { id: real.id } })).not.toBeNull();
    expect(await db.customerCase.count({ where: { isDemo: true } })).toBe(5);
  });

  it("concurrent resets leave exactly one complete demo set", async () => {
    await Promise.all([resetDemo(admin), resetDemo(admin), resetDemo(admin)]);
    expect(await db.customerCase.count({ where: { isDemo: true } })).toBe(5);
    expect(await db.customerCase.count({ where: { isDemo: true, orderReference: "DEMO-VASE-0001" } })).toBe(1);
    expect(await db.shipment.count({ where: { isDemo: true } })).toBe(5);
  });

  it("fails cleanly and keeps the demo intact if something outside the demo references it", async () => {
    const vase = await demoCase("DEMO-VASE-0001");
    const order = await db.order.findFirstOrThrow({ where: { id: vase.linkedOrderId! } });
    const blocker = await db.customerCase.create({ data: { source: "email", customerName: "Not A Demo Case", complaintText: "uses a demo order", caseType: "other", linkedOrderId: order.id } });
    await expect(resetDemo(admin)).rejects.toThrow(/cannot be reset/);
    expect(await db.customerCase.count({ where: { isDemo: true } })).toBe(5); // nothing was half-deleted
    expect((await db.customerCase.findUniqueOrThrow({ where: { id: blocker.id } })).linkedOrderId).toBe(order.id); // and the real case kept its link
    expect((await demoCase("DEMO-VASE-0001")).id).toBe(vase.id);
    await db.customerCase.delete({ where: { id: blocker.id } });
    await resetDemo(admin); // recovers once the blocker is gone
    expect(await db.customerCase.count({ where: { isDemo: true } })).toBe(5);
  });
});
