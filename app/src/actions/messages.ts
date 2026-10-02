"use server";

import { revalidatePath } from "next/cache";
import { getActor } from "@/lib/session";
import {
  discardMessage,
  editMessageDraft,
  generateEvidenceRequest,
  markMessageSent,
  MessageError,
} from "@/server/workflows/customer-message";

async function run(caseId: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    return e instanceof Error ? e.message : "Unexpected error";
  }
  revalidatePath(`/cases/${caseId}`);
}

export async function draftEvidenceRequestAction(caseId: string) {
  return run(caseId, async () => generateEvidenceRequest(await getActor(), caseId));
}

/** One form, three buttons. Sending first saves any unsaved edits so the text sent is what is on screen. */
export async function messageAction(draftId: string, caseId: string, _p: string | undefined, fd: FormData) {
  const intent = String(fd.get("intent"));
  const body = String(fd.get("body") ?? "");
  return run(caseId, async () => {
    const actor = await getActor();
    if (intent === "save") return editMessageDraft(actor, draftId, body);
    if (intent === "discard") return discardMessage(actor, draftId);
    if (intent === "send") {
      try {
        await editMessageDraft(actor, draftId, body);
      } catch (e) {
        if (!(e instanceof MessageError && e.message === "No changes were made")) throw e;
      }
      return markMessageSent(actor, draftId);
    }
    throw new Error("Choose an action");
  });
}
