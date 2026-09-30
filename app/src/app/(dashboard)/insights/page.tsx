import { generateWeeklyReportAction, recomputeInsightsAction } from "@/actions/reporting";
import { ActionButton } from "@/components/features/action-button";
import { getActor } from "@/lib/session";
import { REVIEW_ROLES } from "@/server/auth";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

const trendLabel = { up: "up", down: "down", stable: "stable" } as const;

export default async function InsightsPage() {
  const [actor, insights, reports] = await Promise.all([
    getActor(),
    db.insightRecord.findMany({ orderBy: [{ frequency: "desc" }, { issueType: "asc" }] }),
    db.weeklyReport.findMany({ orderBy: { weekStart: "desc" }, take: 8 }),
  ]);
  const canRun = !!actor && REVIEW_ROLES.includes(actor.role);
  const computedAt = insights[0]?.createdAt;
  return (
    <div className="flex max-w-5xl flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Insights</h1>
          {canRun && <ActionButton action={recomputeInsightsAction} label="Recompute insights" pendingLabel="Recomputing..." />}
        </div>
        <p className="text-sm text-muted-foreground">
          Repeated issues among resolved and escalated cases, grouped by SKU, carrier, supplier, warehouse and issue type.
          Trend compares the last 30 days with the 30 days before. Recomputed nightly and on demand; each run replaces the
          previous set.{computedAt ? ` Last computed ${computedAt.toISOString().slice(0, 16).replace("T", " ")} UTC.` : ""}
        </p>
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr><th className="py-1">Issue</th><th>SKU</th><th>Carrier</th><th>Supplier</th><th>Warehouse</th><th>Frequency</th><th>Trend</th></tr>
          </thead>
          <tbody>
            {insights.map((i) => (
              <tr key={i.id} className="border-t border-border">
                <td className="py-1">{i.issueType}</td>
                <td>{i.sku ?? "-"}</td>
                <td>{i.carrier ?? "-"}</td>
                <td>{i.supplier ?? "-"}</td>
                <td>{i.warehouse ?? "-"}</td>
                <td>{i.frequency}</td>
                <td>{trendLabel[i.trendDirection]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {insights.length === 0 && <p className="text-sm text-muted-foreground">No insights yet. They need resolved or escalated cases.</p>}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Weekly reports</h2>
          {canRun && <ActionButton action={generateWeeklyReportAction} label="Generate report for last week" pendingLabel="Generating..." />}
        </div>
        {reports.map((r) => (
          <details key={r.id} className="rounded-md border border-border p-3 text-sm">
            <summary className="cursor-pointer">
              Week of {r.weekStart.toISOString().slice(0, 10)} (generated {r.generatedAt.toISOString().slice(0, 16).replace("T", " ")} UTC by {r.generatedBy})
            </summary>
            <pre className="mt-2 whitespace-pre-wrap font-sans">{r.markdown}</pre>
          </details>
        ))}
        {reports.length === 0 && <p className="text-sm text-muted-foreground">No reports yet.</p>}
      </section>
    </div>
  );
}
