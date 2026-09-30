"use server";

import { revalidatePath } from "next/cache";
import { getActor } from "@/lib/session";
import { actionResolutionProposal } from "@/server/workflows/action-proposal";
import { regenerateRecoveryDraft } from "@/server/workflows/recovery-draft";
import { reviewApproval } from "@/server/workflows/review-approval";
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

export async function reviewApprovalAction(approvalId: string, _p: string | undefined, fd: FormData) {
  const decision = fd.get("decision");
  if (decision !== "approved" && decision !== "rejected") return "Choose approve or reject";
  return run(null, async () =>
    reviewApproval(await getActor(), approvalId, decision, String(fd.get("comment") ?? "")),
  );
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
