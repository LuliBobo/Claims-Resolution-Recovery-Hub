import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Actor } from "@/server/auth";
import { db } from "@/server/db";
import { CARRIER_CLAIMS_SOP_NAME } from "@/server/evidence/carrier-claims-gate";
import type { AttachmentObservation } from "@/server/evidence/assess";
import type { GeneratedProposal } from "@/server/llm/generate-proposal";
import { createCase, type IntakeLlm } from "@/server/workflows/case-intake";
import { generateResolutionProposal, evaluateGateForCase } from "@/server/workflows/proposal-generation";
import { regenerateResolutionProposal } from "@/server/workflows/regenerate-proposal";
import { uploadAttachment } from "@/server/workflows/upload-attachment";

const agent: Actor = { id: "u1", email: "agent@test.io", name: "A", role: "agent" };
const intakeLlm: IntakeLlm = {
  summarize: async () => ({ customerLanguage: "en", internalEnglishSummary: "Vase arrived broken." }),
  classify: async () => ({ caseType: "damaged_delivery", priority: "medium", confidence: 0.95 }),
};
const llmProposal: GeneratedProposal = {
  recommendation: "Replace item",
  rationale: "Damage reported.",
  confidence: 0.8,
  customerImpact: "moderate",
  businessExposure: "manageable",
  policySource: `${CARRIER_CLAIMS_SOP_NAME} v1.0`,
  needsHumanApproval: false,
  customerReplyDraft: "Sorry to hear that.",
};
const deps = { generate: async () => llmProposal };
const complaint = { source: "email", customerName: "Gate Test", complaintText: "Vase arrived shattered." };

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const photo = (subject: "item" | "outer_carton"): AttachmentObservation => ({
  kind: "photo", notes: subject, observation: { legible: true, showsDamageOrCondition: true, subject },
});
const label: AttachmentObservation = {
  kind: "shipping_label", notes: "label",
  observation: { legible: true, hasTrackingNumber: true, hasCarrier: true, hasAddress: true, hasShipDate: true },
};

const caseIds: string[] = [];
let policyId: string;
let ruleId: string;

beforeAll(async () => {
  process.env.UPLOAD_DIR = await mkdtemp(path.join(tmpdir(), "uploads-"));
  const policy = await db.policyDocument.create({ data: { name: CARRIER_CLAIMS_SOP_NAME, documentType: "carrier_agreement", version: "1.0" } });
  policyId = policy.id;
  ruleId = (await db.rule.create({ data: { ruleName: "test damaged", triggerType: "damaged_delivery", linkedPolicyDocumentId: policyId } })).id;
});
afterAll(async () => {
  await db.customerCase.deleteMany({ where: { id: { in: caseIds } } });
  await db.rule.delete({ where: { id: ruleId } });
  await db.policyDocument.delete({ where: { id: policyId } });
  await db.$disconnect();
});

async function newCase() {
  const c = await createCase(agent, complaint, intakeLlm, deps);
  caseIds.push(c.id);
  return c;
}
const upload = (caseId: string, category: string, obs: AttachmentObservation, name = "f.png") =>
  uploadAttachment(agent, { caseId, fileName: name, declaredContentType: "image/png", category, bytes: png }, { observe: async () => obs });

describe("case intake -> proposal", () => {
  it("with no evidence, the gate overrides the recommendation but keeps the LLM's reasoning", async () => {
    const c = await newCase();
    const [p] = await db.resolutionProposal.findMany({ where: { linkedCaseId: c.id }, include: { approvals: true } });
    expect(p).toMatchObject({
      recommendation: "Request Missing Evidence",
      evidenceGateApplied: true,
      rationale: "Damage reported.",
      confidence: 0.8,
      status: "pending_approval",
      customerReplyDraft: "Sorry to hear that.",
    });
    expect(p.approvals).toHaveLength(1);
    expect(p.approvals[0]).toMatchObject({ decision: "pending", approvalType: "resolution_proposal" });
    const fresh = await db.customerCase.findUniqueOrThrow({ where: { id: c.id } });
    expect(fresh).toMatchObject({ status: "awaiting_approval", resolutionRecommendation: "Request Missing Evidence" });
    const actions = (await db.auditEvent.findMany({ where: { linkedCaseId: c.id } })).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["case_created", "resolution_proposal_generated", "status_changed"]));
  });

  it("uploads flip the checklist immediately; regenerating then keeps the LLM recommendation", async () => {
    const c = await newCase();
    await upload(c.id, "shipping_label", label);
    await upload(c.id, "photo_evidence", photo("item"));
    expect((await evaluateGateForCase(c.id)).evidenceComplete).toBe(false);
    await upload(c.id, "photo_evidence", photo("outer_carton"));
    expect((await evaluateGateForCase(c.id)).evidenceComplete).toBe(true);

    const { proposal } = await regenerateResolutionProposal(agent, c.id, deps);
    expect(proposal).toMatchObject({ recommendation: "Replace item", evidenceGateApplied: false });
  });

  it("an attachment whose judging fails stays pending_review and does not satisfy the gate", async () => {
    const c = await newCase();
    const a = await uploadAttachment(
      agent,
      { caseId: c.id, fileName: "l.png", declaredContentType: "image/png", category: "shipping_label", bytes: png },
      { observe: async () => { throw new Error("no api"); } },
    );
    expect(a.evidenceStatus).toBe("pending_review");
    expect((await evaluateGateForCase(c.id)).checklist.shippingLabelPhoto).toBe(false);
    expect((await db.auditEvent.findMany({ where: { linkedCaseId: c.id, action: "llm_step_failed" } })).length).toBe(1);
  });

  it("an insufficient judgment is stored and does not count", async () => {
    const c = await newCase();
    const a = await upload(c.id, "shipping_label", { ...label, observation: { ...label.observation, hasTrackingNumber: false } as never });
    expect(a.evidenceStatus).toBe("insufficient");
  });
});

describe("guarded status auto-advance", () => {
  it("never moves a case that is already past new", async () => {
    const c = await newCase(); // now awaiting_approval
    await db.customerCase.update({ where: { id: c.id }, data: { status: "escalated" } });
    await generateResolutionProposal("test", c.id, deps);
    expect((await db.customerCase.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("escalated");
  });
});

describe("LLM failure at intake", () => {
  it("still creates the case and flags it for triage", async () => {
    const c = await createCase(agent, complaint, intakeLlm, { generate: async () => { throw new Error("down"); } });
    caseIds.push(c.id);
    const fresh = await db.customerCase.findUniqueOrThrow({ where: { id: c.id } });
    expect(fresh.needsManualTriage).toBe(true);
    expect(await db.resolutionProposal.count({ where: { linkedCaseId: c.id } })).toBe(0);
  });
});
