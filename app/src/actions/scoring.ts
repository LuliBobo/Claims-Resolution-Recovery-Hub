"use server";

import { revalidatePath } from "next/cache";
import { getActor } from "@/lib/session";
import { FACTOR_KEYS, type FactorKey } from "@/server/scoring/workflow-score";
import { setScoreOverride } from "@/server/scoring";

export async function scoreOverrideAction(caseId: string, _p: string | undefined, fd: FormData) {
  const factor = String(fd.get("factor")) as FactorKey;
  if (!FACTOR_KEYS.includes(factor)) return "Choose a factor";
  const raw = String(fd.get("score"));
  const score = raw === "reset" ? null : (Number(raw) as 0 | 1 | 2 | 3);
  if (score !== null && ![0, 1, 2, 3].includes(score)) return "Choose a score from 0 to 3";
  try {
    await setScoreOverride(await getActor(), caseId, factor, score, String(fd.get("reason") ?? ""));
  } catch (e) {
    return e instanceof Error ? e.message : "Unexpected error";
  }
  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/approvals");
}
