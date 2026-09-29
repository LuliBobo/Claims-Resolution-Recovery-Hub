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

export const dynamic = "force-dynamic";

const DOC_TYPES = ["policy", "terms", "carrier_agreement", "supplier_agreement", "other"];
const TRIGGERS = ["damaged_delivery", "wrong_item", "missing_item", "return_request", "other"];
const opt = (xs: string[]) => xs.map((x) => ({ value: x, label: x }));

export default async function PolicyRulesPage() {
  const [actor, policies, rules] = await Promise.all([getActor(), listPolicyDocuments(), listRules()]);
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
