import { db } from "@/server/db";

// Weekly report job. Callable manually and from cron. Reports the last FULL Monday-Sunday
// week (UTC). Any record missing a timestamp needed for the figures is reported under
// "timestamp unavailable" instead of being silently dropped or guessed.

const DAY = 86_400_000;

export interface WeekWindow {
  start: Date; // Monday 00:00:00 UTC, inclusive
  end: Date; // next Monday 00:00:00 UTC, exclusive
}

/** The last full Monday-Sunday week (UTC) that ended on or before `now`. */
export function previousWeekWindow(now: Date): WeekWindow {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const sinceMonday = (now.getUTCDay() + 6) % 7; // Mon=0 ... Sun=6
  const thisMonday = midnight - sinceMonday * DAY;
  return { start: new Date(thisMonday - 7 * DAY), end: new Date(thisMonday) };
}

export interface ReportData {
  cases: { createdAt: Date; status: string; caseType: string; resolvedAt: Date | null }[];
  proposals: { createdAt: Date }[];
  approvals: { decision: string; decisionTime: Date | null }[];
  drafts: { status: string; sentAt: Date | null; approvedAt: Date | null; estimatedRecoverableValue: number | null }[];
}

const within = (d: Date | null, w: WeekWindow) => d !== null && d >= w.start && d < w.end;
const day = (d: Date) => d.toISOString().slice(0, 10);

function tally<T>(items: T[], key: (t: T) => string) {
  const m = new Map<string, number>();
  for (const i of items) m.set(key(i), (m.get(key(i)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
const list = (rows: [string, number][]) => (rows.length ? rows.map(([k, n]) => `- ${k}: ${n}`).join("\n") : "- none");

export function buildWeeklyReport(data: ReportData, w: WeekWindow): string {
  const opened = data.cases.filter((c) => within(c.createdAt, w));
  const resolvedNoTime = data.cases.filter((c) => c.status === "resolved" && c.resolvedAt === null);
  const resolved = data.cases.filter((c) => within(c.resolvedAt, w));
  const proposals = data.proposals.filter((p) => within(p.createdAt, w));
  const decided = data.approvals.filter((a) => (a.decision === "approved" || a.decision === "rejected") && within(a.decisionTime, w));
  const decidedNoTime = data.approvals.filter((a) => (a.decision === "approved" || a.decision === "rejected") && a.decisionTime === null);
  const sent = data.drafts.filter((d) => d.status === "sent" && within(d.sentAt, w));
  const sentNoTime = data.drafts.filter((d) => d.status === "sent" && d.sentAt === null);
  const sentValue = sent.reduce((sum, d) => sum + (d.estimatedRecoverableValue ?? 0), 0);

  const unavailable = [
    resolvedNoTime.length && `${resolvedNoTime.length} resolved case(s) have no resolved-at timestamp; timestamp unavailable, not counted in "resolved" below`,
    decidedNoTime.length && `${decidedNoTime.length} decided approval(s) have no decision time; timestamp unavailable, not counted in "approvals decided" below`,
    sentNoTime.length && `${sentNoTime.length} sent recovery draft(s) have no sent-at timestamp; timestamp unavailable, not counted in "recovery drafts sent" below`,
  ].filter(Boolean);

  return [
    `# Weekly report: ${day(w.start)} to ${day(new Date(w.end.getTime() - DAY))}`,
    "",
    "Prototype figures. Week is Monday to Sunday, UTC.",
    "",
    "## Summary",
    `- Cases opened: ${opened.length}`,
    `- Cases resolved: ${resolved.length}`,
    `- Resolution proposals generated: ${proposals.length}`,
    `- Approvals decided: ${decided.length} (approved ${decided.filter((a) => a.decision === "approved").length}, rejected ${decided.filter((a) => a.decision === "rejected").length})`,
    `- Recovery drafts sent: ${sent.length}, estimated value ${sentValue.toFixed(2)}`,
    "",
    "## Cases opened by type",
    list(tally(opened, (c) => c.caseType)),
    "",
    "## Cases opened by current status",
    list(tally(opened, (c) => c.status)),
    "",
    "## Data gaps",
    unavailable.length ? unavailable.map((u) => `- ${u}`).join("\n") : "- none",
    "",
  ].join("\n");
}

/** Generates (or replaces) the report for the last full week. */
export async function generateWeeklyReport(generatedBy: string, now: Date = new Date()) {
  const w = previousWeekWindow(now);
  const [cases, proposals, approvals, drafts] = await Promise.all([
    db.customerCase.findMany({ select: { createdAt: true, status: true, caseType: true, resolvedAt: true } }),
    db.resolutionProposal.findMany({ select: { createdAt: true } }),
    db.humanApproval.findMany({ select: { decision: true, decisionTime: true } }),
    db.recoveryDraft.findMany({ select: { status: true, sentAt: true, approvedAt: true, estimatedRecoverableValue: true } }),
  ]);
  const markdown = buildWeeklyReport(
    {
      cases,
      proposals,
      approvals,
      drafts: drafts.map((d) => ({ ...d, estimatedRecoverableValue: d.estimatedRecoverableValue === null ? null : Number(d.estimatedRecoverableValue) })),
    },
    w,
  );
  return db.weeklyReport.upsert({
    where: { weekStart: w.start },
    create: { weekStart: w.start, weekEnd: w.end, markdown, generatedBy },
    update: { markdown, weekEnd: w.end, generatedAt: new Date(), generatedBy },
  });
}
