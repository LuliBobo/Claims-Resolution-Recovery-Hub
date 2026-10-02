import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { generateWeeklyReport } from "@/server/jobs/weekly-report";

export const dynamic = "force-dynamic";
// LLM calls happen in this route (or the actions it hosts); allow more than the platform default.
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const report = await generateWeeklyReport("cron");
  return NextResponse.json({ id: report.id, weekStart: report.weekStart, weekEnd: report.weekEnd });
}
