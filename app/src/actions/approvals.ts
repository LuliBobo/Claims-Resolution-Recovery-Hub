"use server";

import { revalidatePath } from "next/cache";
import { getActor } from "@/lib/session";
import { actionResolutionProposal } from "@/server/workflows/action-proposal";
import { regenerateRecoveryDraft } from "@/server/workflows/recovery-draft";
import { reconcileLegacyCurrentProposal } from "@/server/workflows/reconcile-proposal";
import { approveWithEdits, reviewApproval } from "@/server/workflows/review-approval";
import { sendRecoveryDraft } from "@/server/workflows/send-recovery-draft";

// Thin wrappers. Each returns an error string for the UI, or undefined on success.
async function run(caseId: string | null, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    return e instanceof Error ? e.message : "Unexpected error";
  }
  revalidatePath("/approvals");
  revalidatePath("/cases");
  if (caseId) revalidatePath(`/cases/${caseId}`);
}

const EDIT_FIELDS = ["recommendation", "rationale", "customerReplyDraft", "claimType", "draftText", "estimatedRecoverableValue"] as const;

export async function reviewApprovalAction(approvalId: string, _p: string | undefined, fd: FormData) {
  const decision = String(fd.get("decision"));
  const comment = String(fd.get("comment") ?? "");
  if (decision === "approved" || decision === "rejected" || decision === "evidence_requested") {
    return run(null, async () => reviewApproval(await getActor(), approvalId, decision, comment));
  }
  if (decision === "approved_with_edits") {
    // The form always carries the current values; the workflow keeps only real differences.
    const edits: Record<string, string | number> = {};
    for (const f of EDIT_FIELDS) {
      const raw = fd.get(`edit_${f}`);
      if (raw === null) continue;
      if (f === "estimatedRecoverableValue") {
        if (String(raw).trim() !== "") edits[f] = Number(raw);
      } else edits[f] = String(raw);
    }
    return run(null, async () => approveWithEdits(await getActor(), approvalId, edits, comment));
  }
  return "Choose a review action";
}

export async function markProposalSentAction(proposalId: string, caseId: string) {
  return run(caseId, async () => actionResolutionProposal(await getActor(), proposalId));
}

export async function sendRecoveryDraftAction(draftId: string, caseId: string) {
  return run(caseId, async () => sendRecoveryDraft(await getActor(), draftId));
}

export async function regenerateRecoveryDraftAction(caseId: string) {
  return run(caseId, async () => regenerateRecoveryDraft(await getActor(), caseId));
}

export async function reconcileProposalAction(caseId: string, _p: string | undefined, fd: FormData) {
  return run(caseId, async () =>
    reconcileLegacyCurrentProposal(await getActor(), caseId, String(fd.get("proposalId") ?? ""), String(fd.get("comment") ?? "")),
  );
}
