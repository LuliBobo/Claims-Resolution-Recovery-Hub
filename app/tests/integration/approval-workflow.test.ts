import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { AuthError, type Actor } from "@/server/auth";
import { db } from "@/server/db";
import { CARRIER_CLAIMS_SOP_NAME } from "@/server/evidence/carrier-claims-gate";
import type { AttachmentObservation } from "@/server/evidence/assess";
import type { IntakeLlm } from "@/server/workflows/case-intake";
import { createCase } from "@/server/workflows/case-intake";
import { actionResolutionProposal } from "@/server/workflows/action-proposal";
import { correctRecoveryDraftValue, RecoveryError } from "@/server/workflows/recovery-draft";
import { regenerateResolutionProposal } from "@/server/workflows/regenerate-proposal";
import { ApprovalError, listPendingApprovals, reviewApproval } from "@/server/workflows/review-approval";
import { sendRecoveryDraft } from "@/server/workflows/send-recovery-draft";
import { uploadAttachment } from "@/server/workflows/upload-attachment";

const agent: Actor = { id: "a", email: "agent@test.io", name: "A", role: "agent" };
const reviewer: Actor = { id: "r", email: "reviewer@test.io", name: "R", role: "reviewer" };

const intakeLlm: IntakeLlm = {
  summarize: async () => ({ customerLanguage: "en", internalEnglishSummary: "Broken vase." }),
  classify: async () => ({ caseType: "damaged_delivery", priority: "medium", confidence: 0.9 }),
};
const proposalDeps = {
  generate: async () => ({
    recommendation: "Replace item", rationale: "Damaged in transit.", confidence: 0.8, customerImpact: "moderate",
    businessExposure: "manageable", policySource: CARRIER_CLAIMS_SOP_NAME, needsHumanApproval: true, customerReplyDraft: "Sorry.",
  }),
};
const recoveryDeps = {
  generate: async () => ({ claimType: "Transit damage", draftText: "Dear DPD, ...", estimatedRecoverableValue: 40 }),
};

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const photo = (subject: "item" | "outer_carton"): AttachmentObservation => ({ kind: "photo", notes: subject, observation: { legible: true, showsDamageOrCondition: true, subject } });
const label: AttachmentObservation = { kind: "shipping_label", notes: "l", observation: { legible: true, hasTrackingNumber: true, hasCarrier: true, hasAddress: true, hasShipDate: true } };
const upload = (caseId: string, category: string, obs: AttachmentObservation) =>
  uploadAttachment(agent, { caseId, fileName: "f.png", declaredContentType: "image/png", category, bytes: png }, { observe: async () => obs });

const caseIds: string[] = [];
let policyId: string, ruleId: string, orderId: string, shipmentId: string;

beforeAll(async () => {
  process.env.UPLOAD_DIR = await mkdtemp(path.join(tmpdir(), "uploads-"));
  policyId = (await db.policyDocument.create({ data: { name: CARRIER_CLAIMS_SOP_NAME, documentType: "carrier_agreement" } })).id;
  ruleId = (await db.rule.create({ data: { ruleName: "t", triggerType: "damaged_delivery", linkedPolicyDocumentId: policyId } })).id;
  orderId = (await db.order.create({ data: { orderDate: new Date(), salesChannel: "web", customerName: "T", sku: "S", productName: "Vase", quantity: 1, orderValue: 40 } })).id;
  shipmentId = (await db.shipment.create({ data: { linkedOrderId: orderId, carrier: "DPD", trackingNumber: "T1" } })).id;
});
afterAll(async () => {
  await db.customerCase.deleteMany({ where: { id: { in: caseIds } } });
  await db.shipment.delete({ where: { id: shipmentId } });
  await db.order.delete({ where: { id: orderId } });
  await db.rule.delete({ where: { id: ruleId } });
  await db.policyDocument.delete({ where: { id: policyId } });
  await db.$disconnect();
});

async function newCase(extra: Record<string, unknown> = {}) {
  const c = await createCase(
    agent,
    { source: "email", customerName: "Approval Test", complaintText: "Vase broken", linkedOrderId: orderId, linkedShipmentId: shipmentId, recoveryNeeded: "on", ...extra },
    intakeLlm, proposalDeps, recoveryDeps,
  );
  caseIds.push(c.id);
  return c;
}
async function approvalsOf(caseId: string) {
  const all = await db.humanApproval.findMany({ where: { linkedCaseId: caseId } });
  return {
    proposal: all.find((a) => a.approvalType === "resolution_proposal")!,
    draft: all.find((a) => a.approvalType === "recovery_draft")!,
  };
}

describe("full closed path (Luo's happy path, at workflow level)", () => {
  it("intake creates a proposal and a carrier draft, each with its own pending approval", async () => {
    const c = await newCase();
    const draft = await db.recoveryDraft.findFirstOrThrow({ where: { linkedCaseId: c.id } });
    expect(draft).toMatchObject({ counterpartyType: "carrier", counterpartyName: "DPD", status: "pending_approval" });
    const { proposal, draft: da } = await approvalsOf(c.id);
    expect([proposal.decision, da.decision]).toEqual(["pending", "pending"]);
    expect(da.linkedResolutionProposalId).toBeNull();
    expect((await listPendingApprovals()).map((a) => a.id)).toEqual(expect.arrayContaining([proposal.id, da.id]));
  });

  it("send is gated on approval, then on evidence, then succeeds", async () => {
    const c = await newCase();
    const draft = await db.recoveryDraft.findFirstOrThrow({ where: { linkedCaseId: c.id } });
    const { draft: da } = await approvalsOf(c.id);

    await expect(sendRecoveryDraft(agent, draft.id)).rejects.toThrow(/approved draft/); // not approved yet
    await reviewApproval(reviewer, da.id, "approved", "ok");
    expect(await db.recoveryDraft.findUniqueOrThrow({ where: { id: draft.id } })).toMatchObject({ status: "approved" });

    // approved, but evidence gate still incomplete: refused
    await expect(sendRecoveryDraft(agent, draft.id)).rejects.toThrow(/Evidence is incomplete/);

    await upload(c.id, "shipping_label", label);
    await upload(c.id, "photo_evidence", photo("item"));
    await upload(c.id, "photo_evidence", photo("outer_carton"));
    const sent = await sendRecoveryDraft(agent, draft.id);
    expect(sent.status).toBe("sent");
    expect(sent.sentAt).not.toBeNull();

    // proposal: approve then mark sent
    const { proposal } = await approvalsOf(c.id);
    const p = await db.resolutionProposal.findFirstOrThrow({ where: { linkedCaseId: c.id } });
    await expect(actionResolutionProposal(agent, p.id)).rejects.toBeInstanceOf(ApprovalError);
    await reviewApproval(reviewer, proposal.id, "approved");
    expect((await actionResolutionProposal(agent, p.id)).status).toBe("sent");
    await expect(actionResolutionProposal(agent, p.id)).rejects.toBeInstanceOf(ApprovalError); // already sent

    const actions = (await db.auditEvent.findMany({ where: { linkedCaseId: c.id } })).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["recovery_draft_approved", "recovery_draft_sent", "resolution_proposal_approved", "resolution_proposal_sent"]));
  });

  it("removing evidence after approval blocks sending again (gate is recomputed, not cached)", async () => {
    const c = await newCase();
    const draft = await db.recoveryDraft.findFirstOrThrow({ where: { linkedCaseId: c.id } });
    const { draft: da } = await approvalsOf(c.id);
    await reviewApproval(reviewer, da.id, "approved");
    const atts = [await upload(c.id, "shipping_label", label), await upload(c.id, "photo_evidence", photo("item")), await upload(c.id, "photo_evidence", photo("outer_carton"))];
    await db.attachment.update({ where: { id: atts[2].id }, data: { evidenceStatus: "insufficient" } });
    await expect(sendRecoveryDraft(agent, draft.id)).rejects.toThrow(/outer carton photo/);
  });
});

describe("review rules", () => {
  it("agents cannot review, unauthenticated cannot either", async () => {
    const c = await newCase();
    const { proposal } = await approvalsOf(c.id);
    await expect(reviewApproval(agent, proposal.id, "approved")).rejects.toBeInstanceOf(AuthError);
    await expect(reviewApproval(null, proposal.id, "approved")).rejects.toBeInstanceOf(AuthError);
  });

  it("reject is terminal, records reviewer/comment/time, and blocks sending", async () => {
    const c = await newCase();
    const { proposal } = await approvalsOf(c.id);
    const r = await reviewApproval(reviewer, proposal.id, "rejected", "not covered");
    expect(r).toMatchObject({ decision: "rejected", reviewer: "reviewer@test.io", reviewerComment: "not covered" });
    expect(r.decisionTime).not.toBeNull();
    const p = await db.resolutionProposal.findFirstOrThrow({ where: { linkedCaseId: c.id } });
    expect(p.status).toBe("rejected");
    await expect(reviewApproval(reviewer, proposal.id, "approved")).rejects.toThrow(/already rejected/);
    await expect(actionResolutionProposal(agent, p.id)).rejects.toBeInstanceOf(ApprovalError);
  });

  it("gives a distinct message for superseded approvals", async () => {
    const c = await newCase();
    const { proposal } = await approvalsOf(c.id);
    await db.humanApproval.update({ where: { id: proposal.id }, data: { decision: "superseded", supersededAt: new Date() } });
    await expect(reviewApproval(reviewer, proposal.id, "approved")).rejects.toThrow(/superseded/);
  });

  it("two concurrent reviews of one approval: exactly one wins", async () => {
    const c = await newCase();
    const { proposal } = await approvalsOf(c.id);
    const results = await Promise.allSettled([
      reviewApproval(reviewer, proposal.id, "approved"),
      reviewApproval(reviewer, proposal.id, "rejected"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
});

describe("recovery drafts", () => {
  it("needs a linked carrier/supplier; the case is still created and flagged", async () => {
    const c = await newCase({ linkedOrderId: undefined, linkedShipmentId: undefined });
    expect(await db.recoveryDraft.count({ where: { linkedCaseId: c.id } })).toBe(0);
    expect((await db.customerCase.findUniqueOrThrow({ where: { id: c.id } })).needsManualTriage).toBe(true);
  });

  it("value correction is validated and audited", async () => {
    const c = await newCase();
    const draft = await db.recoveryDraft.findFirstOrThrow({ where: { linkedCaseId: c.id } });
    await expect(correctRecoveryDraftValue(agent, draft.id, -1)).rejects.toBeInstanceOf(RecoveryError);
    const d = await correctRecoveryDraftValue(agent, draft.id, 55);
    expect(d.estimatedRecoverableValue?.toString()).toBe("55");
    const ev = await db.auditEvent.findFirstOrThrow({ where: { linkedCaseId: c.id, action: "recovery_draft_value_corrected" } });
    expect([ev.previousState, ev.newState]).toEqual(["40", "55"]);
  });

  it("regenerating a proposal adds its own pending approval without touching the recovery approval", async () => {
    const c = await newCase();
    await regenerateResolutionProposal(agent, c.id, proposalDeps);
    const all = await db.humanApproval.findMany({ where: { linkedCaseId: c.id } });
    expect(all.filter((a) => a.approvalType === "resolution_proposal")).toHaveLength(2);
    expect(all.filter((a) => a.approvalType === "recovery_draft")).toHaveLength(1);
  });
});
