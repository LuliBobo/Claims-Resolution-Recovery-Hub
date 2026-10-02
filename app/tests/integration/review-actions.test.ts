import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuthError, type Actor } from "@/server/auth";
import { db } from "@/server/db";
import { CARRIER_CLAIMS_SOP_NAME } from "@/server/evidence/carrier-claims-gate";
import type { AttachmentObservation } from "@/server/evidence/assess";
import { actionResolutionProposal } from "@/server/workflows/action-proposal";
import { createCase } from "@/server/workflows/case-intake";
import { regenerateResolutionProposal } from "@/server/workflows/regenerate-proposal";
import { ApprovalError, approveWithEdits, listPendingApprovals, reviewApproval } from "@/server/workflows/review-approval";
import { sendRecoveryDraft } from "@/server/workflows/send-recovery-draft";
import { uploadAttachment } from "@/server/workflows/upload-attachment";

const agent: Actor = { id: "a", email: "agent@test.io", name: "A", role: "agent" };
const reviewer: Actor = { id: "r", email: "reviewer@test.io", name: "R", role: "reviewer" };

const llm = {
  summarize: async () => ({ customerLanguage: "en", internalEnglishSummary: "Broken vase." }),
  classify: async () => ({ caseType: "damaged_delivery" as const, priority: "medium" as const, confidence: 0.9 }),
};
const proposalDeps = {
  generate: async () => ({
    recommendation: "Replace item", rationale: "Damaged in transit.", confidence: 0.8, customerImpact: "moderate",
    businessExposure: "manageable", policySource: CARRIER_CLAIMS_SOP_NAME, needsHumanApproval: true, customerReplyDraft: "Sorry, we will replace it.",
  }),
};
const recoveryDeps = { generate: async () => ({ claimType: "Transit damage", draftText: "Dear DPD, original text.", estimatedRecoverableValue: 40 }) };

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const photo = (subject: "item" | "outer_carton"): AttachmentObservation => ({ kind: "photo", notes: subject, observation: { legible: true, showsDamageOrCondition: true, subject } });
const label: AttachmentObservation = { kind: "shipping_label", notes: "l", observation: { legible: true, hasTrackingNumber: true, hasCarrier: true, hasAddress: true, hasShipDate: true } };
const upload = (caseId: string, category: string, obs: AttachmentObservation) =>
  uploadAttachment(agent, { caseId, fileName: "f.png", declaredContentType: "image/png", category, bytes: png }, { observe: async () => obs });
const addAllEvidence = async (caseId: string) => {
  await upload(caseId, "shipping_label", label);
  await upload(caseId, "photo_evidence", photo("item"));
  await upload(caseId, "photo_evidence", photo("outer_carton"));
};

const caseIds: string[] = [];
let policyId: string, ruleId: string, orderId: string, shipmentId: string;
beforeAll(async () => {
  policyId = (await db.policyDocument.create({ data: { name: CARRIER_CLAIMS_SOP_NAME, documentType: "carrier_agreement" } })).id;
  ruleId = (await db.rule.create({ data: { ruleName: "t", triggerType: "damaged_delivery", linkedPolicyDocumentId: policyId } })).id;
  orderId = (await db.order.create({ data: { orderDate: new Date(), salesChannel: "web", customerName: "T", sku: "S", productName: "Vase", quantity: 1, orderValue: 40 } })).id;
  shipmentId = (await db.shipment.create({ data: { linkedOrderId: orderId, carrier: "DPD", trackingNumber: "RV1" } })).id;
});
afterAll(async () => {
  await db.customerCase.deleteMany({ where: { id: { in: caseIds } } });
  await db.shipment.delete({ where: { id: shipmentId } });
  await db.order.delete({ where: { id: orderId } });
  await db.rule.delete({ where: { id: ruleId } });
  await db.policyDocument.delete({ where: { id: policyId } });
  await db.$disconnect();
});

async function newCase() {
  const c = await createCase(agent, { source: "email", customerName: "Review Test", complaintText: "Vase broken", linkedOrderId: orderId, linkedShipmentId: shipmentId, recoveryNeeded: "on" }, llm, proposalDeps, recoveryDeps);
  caseIds.push(c.id);
  const proposal = await db.resolutionProposal.findFirstOrThrow({ where: { linkedCaseId: c.id } });
  const draft = await db.recoveryDraft.findFirstOrThrow({ where: { linkedCaseId: c.id } });
  const pApproval = await db.humanApproval.findFirstOrThrow({ where: { linkedResolutionProposalId: proposal.id } });
  const dApproval = await db.humanApproval.findFirstOrThrow({ where: { linkedRecoveryDraftId: draft.id } });
  return { c, proposal, draft, pApproval, dApproval };
}

describe("approve with edits", () => {
  it("edits a recovery draft, keeps the original on the approval, and the edited text is what gets sent", async () => {
    const { c, draft, dApproval } = await newCase();
    await addAllEvidence(c.id);
    const a = await approveWithEdits(reviewer, dApproval.id, { draftText: "Dear DPD, corrected text.", estimatedRecoverableValue: 55 }, "fixed amount");
    expect(a).toMatchObject({ decision: "approved", reviewer: "reviewer@test.io", reviewerComment: "fixed amount" });
    expect(a.decisionTime).not.toBeNull();
    expect(a.edits).toEqual({
      draftText: { from: "Dear DPD, original text.", to: "Dear DPD, corrected text." },
      estimatedRecoverableValue: { from: 40, to: 55 },
    });
    const d = await db.recoveryDraft.findUniqueOrThrow({ where: { id: draft.id } });
    expect(d).toMatchObject({ status: "approved", draftText: "Dear DPD, corrected text." });
    expect(d.estimatedRecoverableValue?.toString()).toBe("55");
    expect(d.approvedAt).not.toBeNull();
    expect((await sendRecoveryDraft(agent, draft.id)).status).toBe("sent");
    const ev = await db.auditEvent.findFirstOrThrow({ where: { linkedCaseId: c.id, action: "recovery_draft_approved_with_edits" } });
    expect(ev.notes).toBe("fixed amount; Edited: draftText, estimatedRecoverableValue");
  });

  it("edits a proposal's customer reply and rationale; the case recommendation cache follows a recommendation edit", async () => {
    const { c, proposal, pApproval } = await newCase();
    await addAllEvidence(c.id);
    await regenerateResolutionProposal(agent, c.id, proposalDeps); // evidence complete now, so the LLM recommendation stands
    const current = await db.resolutionProposal.findFirstOrThrow({ where: { linkedCaseId: c.id, status: "pending_approval" } });
    const approval = await db.humanApproval.findFirstOrThrow({ where: { linkedResolutionProposalId: current.id } });
    expect(current.id).not.toBe(proposal.id);
    expect(pApproval.id).not.toBe(approval.id);

    await approveWithEdits(reviewer, approval.id, { recommendation: "Full refund", customerReplyDraft: "We will refund you in full." });
    const after = await db.resolutionProposal.findUniqueOrThrow({ where: { id: current.id } });
    expect(after).toMatchObject({ status: "approved", recommendation: "Full refund", customerReplyDraft: "We will refund you in full.", rationale: current.rationale });
    expect((await db.customerCase.findUniqueOrThrow({ where: { id: c.id } })).resolutionRecommendation).toBe("Full refund");
    expect((await actionResolutionProposal(agent, current.id)).status).toBe("sent");
  });

  it("refuses a recommendation edit while the evidence gate applies and is incomplete (no way around the gate)", async () => {
    const { proposal, pApproval } = await newCase(); // no evidence: gate forced "Request Missing Evidence"
    expect(proposal.recommendation).toBe("Request Missing Evidence");
    await expect(approveWithEdits(reviewer, pApproval.id, { recommendation: "Full refund" })).rejects.toThrow(/cannot be edited/);
    expect((await db.humanApproval.findUniqueOrThrow({ where: { id: pApproval.id } })).decision).toBe("pending");
    // The reply text is still editable, and the gate-forced recommendation is untouched.
    await approveWithEdits(reviewer, pApproval.id, { customerReplyDraft: "Please send us a photo of the box." });
    expect(await db.resolutionProposal.findUniqueOrThrow({ where: { id: proposal.id } })).toMatchObject({ recommendation: "Request Missing Evidence", evidenceGateApplied: true });
  });

  it("rejects no-op edits, empty values, unknown fields and negative values, changing nothing", async () => {
    const { draft, dApproval } = await newCase();
    for (const bad of [{}, { draftText: "Dear DPD, original text." }, { draftText: "  " }, { status: "sent" }, { estimatedRecoverableValue: -3 }]) {
      await expect(approveWithEdits(reviewer, dApproval.id, bad)).rejects.toBeInstanceOf(ApprovalError);
    }
    expect((await db.humanApproval.findUniqueOrThrow({ where: { id: dApproval.id } })).decision).toBe("pending");
    expect((await db.recoveryDraft.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("pending_approval");
  });

  it("needs reviewer/admin and cannot touch a superseded or already-decided approval", async () => {
    const { c, pApproval, dApproval } = await newCase();
    await expect(approveWithEdits(agent, dApproval.id, { claimType: "X" })).rejects.toBeInstanceOf(AuthError);
    await regenerateResolutionProposal(agent, c.id, proposalDeps); // supersedes the first proposal and its pending approval
    await expect(approveWithEdits(reviewer, pApproval.id, { rationale: "x" })).rejects.toThrow(/superseded/);
    await reviewApproval(reviewer, dApproval.id, "approved");
    await expect(approveWithEdits(reviewer, dApproval.id, { claimType: "X" })).rejects.toThrow(/already approved/);
  });

  it("two concurrent edits of one approval: exactly one wins and the content matches the winner", async () => {
    const { draft, dApproval } = await newCase();
    const results = await Promise.allSettled([
      approveWithEdits(reviewer, dApproval.id, { draftText: "Version A" }),
      approveWithEdits(reviewer, dApproval.id, { draftText: "Version B" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const winner = (results.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<{ edits: unknown }>).value;
    const won = (winner.edits as { draftText: { to: string } }).draftText.to;
    expect((await db.recoveryDraft.findUniqueOrThrow({ where: { id: draft.id } })).draftText).toBe(won);
  });
});

describe("request more evidence", () => {
  it("needs a comment, records the human decision, and takes the proposal out of play without rejecting it", async () => {
    const { c, proposal, pApproval } = await newCase();
    await expect(reviewApproval(reviewer, pApproval.id, "evidence_requested")).rejects.toThrow(/comment is required/);
    await expect(reviewApproval(reviewer, pApproval.id, "evidence_requested", "   ")).rejects.toThrow(/comment is required/);
    await expect(reviewApproval(agent, pApproval.id, "evidence_requested", "need photos")).rejects.toBeInstanceOf(AuthError);

    const a = await reviewApproval(reviewer, pApproval.id, "evidence_requested", "Need a photo of the outer carton");
    expect(a).toMatchObject({ decision: "evidence_requested", reviewer: "reviewer@test.io", reviewerComment: "Need a photo of the outer carton" });
    expect(a.decisionTime).not.toBeNull();
    expect((await db.resolutionProposal.findUniqueOrThrow({ where: { id: proposal.id } })).status).toBe("evidence_requested");
    expect((await db.auditEvent.findFirstOrThrow({ where: { linkedCaseId: c.id, action: "resolution_proposal_evidence_requested" } })).notes).toBe("Need a photo of the outer carton");
    // never conflated with rejected, and not sendable
    await expect(actionResolutionProposal(agent, proposal.id)).rejects.toThrow(/approved proposal/);
    await expect(reviewApproval(reviewer, pApproval.id, "approved")).rejects.toThrow(/already evidence_requested/);
  });

  it("leaves the pending queue, and a regenerated proposal replaces it as current", async () => {
    const { c, proposal, pApproval } = await newCase();
    await reviewApproval(reviewer, pApproval.id, "evidence_requested", "more photos please");
    expect((await listPendingApprovals()).map((x) => x.id)).not.toContain(pApproval.id);

    await addAllEvidence(c.id);
    const { proposal: next } = await regenerateResolutionProposal(agent, c.id, proposalDeps);
    expect((await db.customerCase.findUniqueOrThrow({ where: { id: c.id } })).currentResolutionProposalId).toBe(next.id);
    // The old one keeps the human's decision untouched (it was not live, so it is not superseded).
    expect((await db.resolutionProposal.findUniqueOrThrow({ where: { id: proposal.id } })).status).toBe("evidence_requested");
    expect((await db.humanApproval.findUniqueOrThrow({ where: { id: pApproval.id } })).decision).toBe("evidence_requested");
    expect(await db.resolutionProposal.count({ where: { linkedCaseId: c.id, status: { in: ["pending_approval", "approved"] } } })).toBe(1);
  });

  it("works for recovery drafts too: the draft cannot be sent", async () => {
    const { c, draft, dApproval } = await newCase();
    await addAllEvidence(c.id);
    await reviewApproval(reviewer, dApproval.id, "evidence_requested", "Need proof of value");
    expect((await db.recoveryDraft.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("evidence_requested");
    await expect(sendRecoveryDraft(agent, draft.id)).rejects.toThrow(/approved draft/);
  });
});
