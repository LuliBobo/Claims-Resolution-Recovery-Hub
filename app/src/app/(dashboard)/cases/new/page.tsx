import { createCaseAction } from "@/actions/cases";
import { ActionForm, Field, SelectField } from "@/components/features/action-form";
import { CASE_TYPES, PRIORITIES, SOURCES } from "@/lib/validation/case";
import { listOrders, listShipments } from "@/server/reference-data";

export const dynamic = "force-dynamic";

const opt = (xs: readonly string[]) => xs.map((x) => ({ value: x, label: x }));

export default async function NewCasePage() {
  const [orders, shipments] = await Promise.all([listOrders(), listShipments()]);
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <h1 className="text-xl font-semibold">New case</h1>
      <p className="text-sm text-muted-foreground">
        Leave language, type and priority blank to detect them automatically. If the AI step fails the case is
        still created and flagged for manual triage.
      </p>
      <ActionForm action={createCaseAction} submitLabel="Create case">
        <SelectField name="source" label="Source" required options={opt(SOURCES)} />
        <Field name="customerName" label="Customer name" required />
        <Field name="customerEmail" label="Customer email" type="email" />
        <Field name="customerPhone" label="Customer phone" />
        <Field name="customerLanguage" label="Language code (e.g. sk)" />
        <Field name="orderReference" label="Order reference" />
        <SelectField name="caseType" label="Case type" options={opt(CASE_TYPES)} />
        <SelectField name="priority" label="Priority" options={opt(PRIORITIES)} />
        <SelectField
          name="linkedOrderId"
          label="Linked order"
          options={orders.map((o) => ({ value: o.id, label: `${o.customerName} - ${o.productName}` }))}
        />
        <SelectField
          name="linkedShipmentId"
          label="Linked shipment"
          options={shipments.map((s) => ({ value: s.id, label: `${s.carrier} ${s.trackingNumber}` }))}
        />
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="recoveryNeeded" /> Recovery needed (draft a carrier or supplier claim)
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Complaint text
          <textarea name="complaintText" required rows={6} className="rounded-md border border-input bg-background p-3" />
        </label>
      </ActionForm>
    </div>
  );
}
