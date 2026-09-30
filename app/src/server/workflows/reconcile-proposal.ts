import { ADMIN_ONLY, requireRole, type Actor } from "@/server/auth";
import { db } from "@/server/db";
import { logAuditEvent } from "@/server/audit";
import { ApprovalError } from "./review-approval";
import { LIVE_STATUSES, lockCase, describeCurrent, supersedeProposal } from "./proposal-supersession";

/**
 * Admin-only. For a legacy case with a NULL pointer and several live proposals, a human picks
 * the current one. The other live proposals are superseded per rule B.1 (recorded decisions
 * are never modified). Never called automatically, and never infers a choice.
 */
export async function reconcileLegacyCurrentProposal(
  actor: Actor | null,
  caseId: string,
  resolutionProposalId: string,
  reviewerComment: string,
) {
  const admin = requireRole(actor, ...ADMIN_ONLY);
  if (!reviewerComment.trim()) throw new ApprovalError("A comment explaining the choice is required");

  return db.$transaction(
    async (tx) => {
      await lockCase(tx, caseId);
      const state = await describeCurrent(tx, caseId);
      const c = await tx.customerCase.findUniqueOrThrow({ where: { id: caseId }, select: { currentResolutionProposalId: true } });
      if (c.currentResolutionProposalId) throw new ApprovalError("This case already has a current proposal");
      if (!state.needsReconciliation) throw new ApprovalError("This case does not need reconciliation");

      const chosen = await tx.resolutionProposal.findUniqueOrThrow({ where: { id: resolutionProposalId } });
      if (chosen.linkedCaseId !== caseId) throw new ApprovalError("Proposal belongs to a different case");
      if (!(LIVE_STATUSES as readonly string[]).includes(chosen.status)) {
        throw new ApprovalError("Only a pending or approved proposal can become current");
      }

      for (const id of state.liveIds.filter((i) => i !== resolutionProposalId)) {
        await supersedeProposal(tx, id, admin.email, "Manual reconciliation");
      }
      await tx.customerCase.update({
        where: { id: caseId },
        data: { currentResolutionProposalId: resolutionProposalId, resolutionRecommendation: chosen.recommendation },
      });
      await logAuditEvent(
        {
          caseId,
          actor: admin.email,
          action: "resolution_proposal_manually_reconciled",
          newState: resolutionProposalId,
          notes: reviewerComment.trim(),
        },
        tx,
      );
    },
    { timeout: 20_000, maxWait: 20_000 },
  );
}
