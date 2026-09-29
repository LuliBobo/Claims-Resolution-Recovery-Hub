"use server";

import { revalidatePath } from "next/cache";
import { getActor } from "@/lib/session";
import * as ref from "@/server/reference-data";

// Thin wrappers: resolve the actor, delegate to src/server, revalidate.
// Returns an error string for the form, or undefined on success.
async function run(path: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    return e instanceof Error ? e.message : "Unexpected error";
  }
  revalidatePath(path);
}

const form = (fd: FormData) => Object.fromEntries(fd.entries());

export async function createOrderAction(_p: string | undefined, fd: FormData) {
  return run("/orders", async () => ref.createOrder(await getActor(), form(fd)));
}
export async function createShipmentAction(_p: string | undefined, fd: FormData) {
  return run("/shipments", async () => ref.createShipment(await getActor(), form(fd)));
}
export async function createPolicyDocumentAction(_p: string | undefined, fd: FormData) {
  return run("/policy-rules", async () => ref.createPolicyDocument(await getActor(), form(fd)));
}
export async function createRuleAction(_p: string | undefined, fd: FormData) {
  return run("/policy-rules", async () => ref.createRule(await getActor(), form(fd)));
}
export async function togglePolicyActiveAction(id: string, active: boolean) {
  await run("/policy-rules", async () => ref.setPolicyDocumentActive(await getActor(), id, active));
}
export async function toggleRuleActiveAction(id: string, active: boolean) {
  await run("/policy-rules", async () => ref.setRuleActive(await getActor(), id, active));
}
