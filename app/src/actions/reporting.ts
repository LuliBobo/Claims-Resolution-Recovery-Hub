"use server";

import { revalidatePath } from "next/cache";
import { getActor } from "@/lib/session";
import { REVIEW_ROLES, requireRole } from "@/server/auth";
import { recomputeInsights } from "@/server/jobs/recompute-insights";
import { generateWeeklyReport } from "@/server/jobs/weekly-report";

// Manual triggers for the two scheduled jobs. Same job functions the cron routes call.
async function run(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    return e instanceof Error ? e.message : "Unexpected error";
  }
  revalidatePath("/insights");
}

export async function recomputeInsightsAction() {
  return run(async () => {
    requireRole(await getActor(), ...REVIEW_ROLES);
    return recomputeInsights();
  });
}

export async function generateWeeklyReportAction() {
  return run(async () => {
    const actor = requireRole(await getActor(), ...REVIEW_ROLES);
    return generateWeeklyReport(actor.email);
  });
}
