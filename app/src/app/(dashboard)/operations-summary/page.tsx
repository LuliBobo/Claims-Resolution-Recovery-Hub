import { getOperationsSummary } from "@/server/reporting/operations-summary";

export const dynamic = "force-dynamic";

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border p-4">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

function Breakdown({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="flex flex-col gap-1">
      <h2 className="font-medium">{title}</h2>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">No open cases.</p>}
      {rows
        .slice()
        .sort((a, b) => b.count - a.count)
        .map((r) => (
          <div key={r.label} className="flex items-center gap-2 text-sm">
            <span className="w-40 shrink-0">{r.label}</span>
            <div className="h-3 flex-1 rounded bg-muted">
              <div className="h-3 rounded bg-primary" style={{ width: `${(r.count / max) * 100}%` }} />
            </div>
            <span className="w-8 text-right">{r.count}</span>
          </div>
        ))}
    </div>
  );
}

export default async function OperationsSummaryPage() {
  const s = await getOperationsSummary();
  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <h1 className="text-xl font-semibold">Operations summary</h1>
      <p className="text-sm text-muted-foreground">Open cases only (status not resolved or closed). Read-only.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Open cases" value={s.openCases} />
        <Kpi label="Pending approvals" value={s.pendingApprovals} />
        <Kpi label="Waiting for evidence" value={s.awaitingEvidence} />
        <Kpi label="Open recovery drafts" value={s.openRecoveryDrafts} />
        <Kpi label="Estimated recoverable value" value={s.openRecoverableValue.toFixed(2)} />
        <Kpi label="Cases needing reconciliation" value={s.casesNeedingReconciliation} />
      </div>
      <Breakdown title="By status" rows={s.byStatus} />
      <Breakdown title="By priority" rows={s.byPriority} />
      <Breakdown title="By case type" rows={s.byType} />
    </div>
  );
}
