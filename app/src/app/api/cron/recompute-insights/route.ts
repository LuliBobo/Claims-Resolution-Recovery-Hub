import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { recomputeInsights } from "@/server/jobs/recompute-insights";

export const dynamic = "force-dynamic";
// LLM calls happen in this route (or the actions it hosts); allow more than the platform default.
export const maxDuration = 60;

// Thin wrapper: the same job function is also called by the manual button on /insights.
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await recomputeInsights());
}
