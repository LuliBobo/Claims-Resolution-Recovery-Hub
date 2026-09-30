import { ANY_ROLE, requireRole, type Actor } from "@/server/auth";
import { db } from "@/server/db";
import { logAuditEvent } from "@/server/audit";
import { ApprovalError } from "./review-approval";

/**
 * Marks a resolution proposal as sent. "Sent" is a manual attestation: the system transmits
 * nothing. Only an approved proposal can be sent. The send itself is a conditional update on
 * status = approved, so it cannot race a concurrent state change.
 */
export async function actionResolutionProposal(actor: Actor | null, proposalId: string) {
  const user = requireRole(actor, ...ANY_ROLE);
  return db.$transaction(async (tx) => {
    const p = await tx.resolutionProposal.findUniqueOrThrow({ where: { id: proposalId }, include: { approvals: true } });
    if (p.status !== "approved") throw new ApprovalError(`Only an approved proposal can be marked sent (status is ${p.status})`);
    if (!p.approvals.some((a) => a.decision === "approved")) {
      throw new ApprovalError("No approved human approval is linked to this proposal");
    }
    const sent = await tx.resolutionProposal.updateMany({ where: { id: proposalId, status: "approved" }, data: { status: "sent" } });
    if (sent.count === 0) throw new ApprovalError("Proposal changed state; reload and retry");
    await logAuditEvent(
      { caseId: p.linkedCaseId, actor: user.email, action: "resolution_proposal_sent", previousState: "approved", newState: "sent", notes: "Manual attestation" },
      tx,
    );
    return tx.resolutionProposal.findUniqueOrThrow({ where: { id: proposalId } });
  });
}
