import { REVIEW_ROLES, requireRole, type Actor } from "@/server/auth";
import { db } from "@/server/db";
import { logAuditEvent } from "@/server/audit";
import { lockCase } from "./proposal-supersession";

export class ApprovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApprovalError";
  }
}

/**
 * Human approve/reject. Resolves the linked proposal or draft strictly by foreign key and
 * flips it to approved/rejected. Only pending approvals can be reviewed.
 */
export async function reviewApproval(
  actor: Actor | null,
  approvalId: string,
  decision: "approved" | "rejected",
  comment?: string,
) {
  const user = requireRole(actor, ...REVIEW_ROLES);
  const head = await db.humanApproval.findUniqueOrThrow({ where: { id: approvalId }, select: { linkedCaseId: true } });
  return db.$transaction(async (tx) => {
    // Serialize with regenerate/send/reconcile on the case row, then re-read under the lock.
    await lockCase(tx, head.linkedCaseId);
    const approval = await tx.humanApproval.findUniqueOrThrow({ where: { id: approvalId } });
    if (approval.decision === "superseded") {
      throw new ApprovalError("This approval was superseded by a newer proposal and can no longer be reviewed");
    }
    if (approval.decision !== "pending") throw new ApprovalError(`Approval is already ${approval.decision}`);

    // Conditional update: two reviewers racing on one approval, only one wins.
    const claimed = await tx.humanApproval.updateMany({
      where: { id: approvalId, decision: "pending" },
      data: { decision, reviewer: user.email, reviewerComment: comment?.trim() || null, decisionTime: new Date() },
    });
    if (claimed.count === 0) throw new ApprovalError("Approval was already reviewed");

    if (approval.approvalType === "resolution_proposal" && approval.linkedResolutionProposalId) {
      const moved = await tx.resolutionProposal.updateMany({
        where: { id: approval.linkedResolutionProposalId, status: "pending_approval" },
        data: { status: decision },
      });
      if (moved.count === 0) throw new ApprovalError("Proposal is no longer pending approval");
    } else if (approval.approvalType === "recovery_draft" && approval.linkedRecoveryDraftId) {
      const moved = await tx.recoveryDraft.updateMany({
        where: { id: approval.linkedRecoveryDraftId, status: "pending_approval" },
        data: { status: decision, ...(decision === "approved" ? { approvedAt: new Date() } : {}) },
      });
      if (moved.count === 0) throw new ApprovalError("Recovery draft is no longer pending approval");
    }

    await logAuditEvent(
      {
        caseId: approval.linkedCaseId,
        actor: user.email,
        action: `${approval.approvalType}_${decision}`,
        previousState: "pending",
        newState: decision,
        notes: comment?.trim() || null,
      },
      tx,
    );
    return tx.humanApproval.findUniqueOrThrow({ where: { id: approvalId } });
  });
}

export function listPendingApprovals() {
  return db.humanApproval.findMany({
    where: { decision: "pending" },
    orderBy: { createdAt: "asc" },
    include: { case: true, resolutionProposal: true, recoveryDraft: true },
  });
}
