"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/session";
import { createCase } from "@/server/workflows/case-intake";
import { updateCase } from "@/server/workflows/case-management";

export async function createCaseAction(_p: string | undefined, fd: FormData) {
  let id: string;
  try {
    id = (await createCase(await getActor(), Object.fromEntries(fd.entries()))).id;
  } catch (e) {
    return e instanceof Error ? e.message : "Unexpected error";
  }
  redirect(`/cases/${id}`);
}

export async function updateCaseAction(id: string, _p: string | undefined, fd: FormData) {
  const raw = Object.fromEntries(fd.entries());
  try {
    await updateCase(await getActor(), id, {
      status: raw.status || undefined,
      priority: raw.priority || undefined,
      caseType: raw.caseType || undefined,
      assignedReviewer: raw.assignedReviewer,
      recoveryNeeded: raw.recoveryNeeded === "on",
    });
  } catch (e) {
    return e instanceof Error ? e.message : "Unexpected error";
  }
  revalidatePath(`/cases/${id}`);
  revalidatePath("/cases");
}
