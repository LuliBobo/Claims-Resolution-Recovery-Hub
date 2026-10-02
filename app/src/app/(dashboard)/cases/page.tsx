import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { CASE_TYPES, PRIORITIES, SOURCES, STATUSES } from "@/lib/validation/case";
import { listCases } from "@/server/workflows/case-management";

export const dynamic = "force-dynamic";

function Filter({ name, label, options, value }: { name: string; label: string; options: readonly string[]; value?: string }) {
  return (
    <select name={name} defaultValue={value ?? ""} aria-label={label} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
      <option value="">{label}: all</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

export default async function CasesPage(props: PageProps<"/cases">) {
  const sp = await props.searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const raw = { status: one("status"), priority: one("priority"), caseType: one("caseType"), source: one("source"), q: one("q") };
  const parsed = await listCases(raw).catch(() => []);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Cases</h1>
        <Link href="/cases/new" className={buttonVariants()}>New case</Link>
      </div>
      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={raw.q} placeholder="Search name, email, order, text" className="h-9 w-64 rounded-md border border-input bg-background px-3 text-sm" />
        <Filter name="status" label="Status" options={STATUSES} value={raw.status} />
        <Filter name="priority" label="Priority" options={PRIORITIES} value={raw.priority} />
        <Filter name="caseType" label="Type" options={CASE_TYPES} value={raw.caseType} />
        <Filter name="source" label="Source" options={SOURCES} value={raw.source} />
        <button className={buttonVariants({ variant: "outline" })} type="submit">Filter</button>
      </form>
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr><th className="py-1">Created</th><th>Customer</th><th>Type</th><th>Priority</th><th>Status</th><th>Source</th><th /></tr>
        </thead>
        <tbody>
          {parsed.map((c) => (
            <tr key={c.id} className="border-t border-border">
              <td className="py-1">{c.createdAt.toISOString().slice(0, 10)}</td>
              <td>
                <Link className="underline" href={`/cases/${c.id}`}>{c.customerName}</Link>
                {c.isDemo && <span className="ml-2 rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">DEMO</span>}
              </td>
              <td>{c.caseType}</td>
              <td>{c.priority}</td>
              <td>{c.status}</td>
              <td>{c.source}</td>
              <td>{c.needsManualTriage ? "needs triage" : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {parsed.length === 0 && <p className="text-sm text-muted-foreground">No cases match.</p>}
    </div>
  );
}
