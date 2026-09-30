import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { generateWeeklyReport } from "@/server/jobs/weekly-report";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const report = await generateWeeklyReport("cron");
  return NextResponse.json({ id: report.id, weekStart: report.weekStart, weekEnd: report.weekEnd });
}
