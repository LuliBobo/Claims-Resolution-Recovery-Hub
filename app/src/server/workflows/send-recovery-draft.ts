import { ANY_ROLE, requireRole, type Actor } from "@/server/auth";
import { db } from "@/server/db";
import { logAuditEvent } from "@/server/audit";
import { ApprovalError } from "./review-approval";
import { evaluateGateForCase } from "./proposal-generation";

/**
 * Marks a recovery draft as sent (manual attestation). Requires approved status, and
 * independently re-runs the SAME evidence gate as proposal generation: if evidence is
 * incomplete the send is refused even though the draft was already approved.
 */
export async function sendRecoveryDraft(actor: Actor | null, draftId: string) {
  const user = requireRole(actor, ...ANY_ROLE);
  const draft = await db.recoveryDraft.findUniqueOrThrow({ where: { id: draftId } });
  if (draft.status !== "approved") throw new ApprovalError(`Only an approved draft can be marked sent (status is ${draft.status})`);

  const gate = await evaluateGateForCase(draft.linkedCaseId);
  if (gate.applies && !gate.evidenceComplete) {
    throw new ApprovalError(`Evidence is incomplete, missing: ${gate.missing.join(", ")}`);
  }

  return db.$transaction(async (tx) => {
    const sent = await tx.recoveryDraft.updateMany({
      where: { id: draftId, status: "approved" },
      data: { status: "sent", sentAt: new Date() },
    });
    if (sent.count === 0) throw new ApprovalError("Draft changed state; reload and retry");
    await logAuditEvent(
      { caseId: draft.linkedCaseId, actor: user.email, action: "recovery_draft_sent", previousState: "approved", newState: "sent", notes: "Manual attestation" },
      tx,
    );
    return tx.recoveryDraft.findUniqueOrThrow({ where: { id: draftId } });
  });
}
