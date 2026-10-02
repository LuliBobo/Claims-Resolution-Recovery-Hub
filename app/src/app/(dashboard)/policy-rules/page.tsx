import {
  createPolicyDocumentAction,
  createRuleAction,
  togglePolicyActiveAction,
  toggleRuleActiveAction,
} from "@/actions/reference-data";
import { ActionForm, Field, SelectField } from "@/components/features/action-form";
import { Button } from "@/components/ui/button";
import { getActor } from "@/lib/session";
import { REVIEW_ROLES } from "@/server/auth";
import { listPolicyDocuments, listRules } from "@/server/reference-data";
import { buildSearchTerms } from "@/server/policy/chunk";
import { searchPolicyPassages } from "@/server/policy/search";

export const dynamic = "force-dynamic";

const DOC_TYPES = ["policy", "terms", "carrier_agreement", "supplier_agreement", "other"];
const TRIGGERS = ["damaged_delivery", "wrong_item", "missing_item", "return_request", "other"];
const opt = (xs: string[]) => xs.map((x) => ({ value: x, label: x }));

export default async function PolicyRulesPage(props: PageProps<"/policy-rules">) {
  const sp = await props.searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const q = one("q")?.trim();
  const [actor, policies, rules] = await Promise.all([getActor(), listPolicyDocuments(), listRules()]);
  const hits = q ? await searchPolicyPassages(buildSearchTerms([q]), [], 8) : [];
  const canEdit = !!actor && REVIEW_ROLES.includes(actor.role);
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold">Policy &amp; Rules</h1>
      {!canEdit && <p className="text-sm text-muted-foreground">Read-only: editing requires the reviewer or admin role.</p>}

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Policy documents</h2>
        {canEdit && (
          <ActionForm action={createPolicyDocumentAction} submitLabel="Add policy document">
            <Field name="name" label="Name" required />
            <SelectField name="documentType" label="Type" required options={opt(DOC_TYPES)} />
            <Field name="version" label="Version" />
            <Field name="jurisdiction" label="Jurisdiction" />
            <Field name="summary" label="Summary" />
          </ActionForm>
        )}
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr><th className="py-1">Name</th><th>Type</th><th>Version</th><th>Active</th><th /></tr>
          </thead>
          <tbody>
            {policies.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="py-1">{p.name}</td>
                <td>{p.documentType}</td>
                <td>{p.version ?? "-"}</td>
                <td>{p.activeStatus ? "yes" : "no"}</td>
                <td>
                  {canEdit && (
                    <form action={togglePolicyActiveAction.bind(null, p.id, !p.activeStatus)}>
                      <Button variant="outline" size="sm" type="submit">{p.activeStatus ? "Deactivate" : "Activate"}</Button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Policy PDFs and search</h2>
        <p className="text-sm text-muted-foreground">
          Upload each policy as a PDF. Its text is split into passages (with page numbers) that proposals can cite verbatim.
          There is no OCR: a scanned PDF without a text layer yields nothing searchable.
        </p>
        {one("pdfError") && <p className="text-sm text-destructive">{one("pdfError")}</p>}
        {one("pdfOk") && <p className="text-sm">Done: {one("pdfOk")}</p>}
        <ul className="flex flex-col gap-3">
          {policies.map((p) => (
            <li key={p.id} className="rounded-md border border-border p-3 text-sm">
              <div className="font-medium">{p.name}{p.version ? ` (v${p.version})` : ""}{!p.activeStatus && " - inactive, not searched"}</div>
              {p.file ? (
                <p className="text-muted-foreground">
                  <a className="underline" href={`/api/policy-documents/${p.id}/pdf`}>{p.file.fileName}</a>: {p.file.pageCount} pages, {p.file.passageCount} passages, uploaded by {p.file.uploadedBy}.
                  {p.file.passageCount === 0 && " No extractable text was found (scanned?), so nothing can be searched or cited."}
                  {p.file.passageCount > 0 && p.file.emptyPages > 0 && ` ${p.file.emptyPages} page(s) had no text.`}
                </p>
              ) : (
                <p className="text-muted-foreground">No PDF uploaded.</p>
              )}
              {canEdit && (
                <form action={`/api/policy-documents/${p.id}/pdf`} method="post" encType="multipart/form-data" className="mt-2 flex flex-wrap items-center gap-2">
                  <input type="file" name="file" accept="application/pdf" required className="text-sm" />
                  <Button type="submit" size="sm" variant="outline">{p.file ? "Replace PDF" : "Upload PDF"}</Button>
                  {p.file && <Button type="submit" size="sm" variant="outline" name="_method" value="delete" formNoValidate>Remove PDF</Button>}
                </form>
              )}
            </li>
          ))}
        </ul>
        <form method="get" className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Test search across active policies, e.g. damaged carton photo" className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm" />
          <Button type="submit" variant="outline">Search</Button>
        </form>
        {q && hits.length === 0 && <p className="text-sm text-muted-foreground">No passage matches.</p>}
        {hits.map((h) => (
          <div key={h.id} className="border-l-2 border-border pl-3 text-sm">
            <div className="text-xs text-muted-foreground">{h.document}{h.version ? ` v${h.version}` : ""}, page {h.page}</div>
            <blockquote>{h.text}</blockquote>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Rules</h2>
        {canEdit && (
          <ActionForm action={createRuleAction} submitLabel="Add rule">
            <Field name="ruleName" label="Rule name" required />
            <SelectField name="triggerType" label="Trigger type" required options={opt(TRIGGERS)} />
            <Field name="requiredEvidence" label="Required evidence" />
            <Field name="recommendedResolution" label="Recommended resolution" />
            <Field name="escalationPath" label="Escalation path" />
            <SelectField
              name="linkedPolicyDocumentId"
              label="Linked policy document"
              options={policies.map((p) => ({ value: p.id, label: p.name }))}
            />
          </ActionForm>
        )}
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr><th className="py-1">Rule</th><th>Trigger</th><th>Policy</th><th>Active</th><th /></tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="py-1">{r.ruleName}</td>
                <td>{r.triggerType}</td>
                <td>{r.linkedPolicyDocument?.name ?? "-"}</td>
                <td>{r.activeStatus ? "yes" : "no"}</td>
                <td>
                  {canEdit && (
                    <form action={toggleRuleActiveAction.bind(null, r.id, !r.activeStatus)}>
                      <Button variant="outline" size="sm" type="submit">{r.activeStatus ? "Deactivate" : "Activate"}</Button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
