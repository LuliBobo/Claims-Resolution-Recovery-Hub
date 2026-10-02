"use server";

import { revalidatePath } from "next/cache";
import { getActor } from "@/lib/session";
import { demoAddCartonPhoto, resetDemo } from "@/server/demo/reset";

async function run(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    return e instanceof Error ? e.message : "Unexpected error";
  }
  for (const p of ["/demo", "/cases", "/approvals", "/insights", "/operations-summary"]) revalidatePath(p);
  revalidatePath("/cases/[caseId]", "page");
}

/** Loads the demo data, or restores it to the known starting state. */
export async function loadDemoAction() {
  return run(async () => resetDemo(await getActor()));
}

/** Step 6 shortcut: the customer's outer-box photo arrives and the proposal is regenerated. */
export async function addCartonPhotoAction() {
  return run(async () => demoAddCartonPhoto(await getActor()));
}
