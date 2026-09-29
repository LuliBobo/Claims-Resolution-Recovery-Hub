import { notFound } from "next/navigation";
import { CaseEditForm } from "@/components/features/case-edit-form";
import { Button } from "@/components/ui/button";
import { ATTACHMENT_CATEGORIES } from "@/lib/validation/case";
import { getCase } from "@/server/workflows/case-management";

export const dynamic = "force-dynamic";

export default async function CaseDetailPage(props: PageProps<"/cases/[caseId]">) {
  const { caseId } = await props.params;
  const sp = await props.searchParams;
  const c = await getCase(caseId).catch(() => null);
  if (!c) notFound();
  const uploadError = typeof sp.uploadError === "string" ? sp.uploadError : undefined;

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{c.customerName}</h1>
        <p className="text-sm text-muted-foreground">
          {c.caseType} / {c.priority} / {c.status} / via {c.source} / language {c.customerLanguage}
        </p>
        {c.needsManualTriage && (
          <p className="mt-2 rounded-md border border-border bg-muted p-2 text-sm">
            The AI triage step failed for this case. Check type, priority and summary manually.
          </p>
        )}
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Complaint</h2>
        <p className="whitespace-pre-wrap text-sm">{c.complaintText}</p>
        <h3 className="text-sm font-medium">Internal English summary</h3>
        <p className="text-sm">{c.internalEnglishSummary ?? "Not available."}</p>
        {(c.order || c.shipment) && (
          <p className="text-sm text-muted-foreground">
            {c.order && `Order: ${c.order.productName} (${c.order.sku}). `}
            {c.shipment && `Shipment: ${c.shipment.carrier} ${c.shipment.trackingNumber}, ${c.shipment.deliveryStatus}.`}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Edit</h2>
        <CaseEditForm
          id={c.id}
          status={c.status}
          priority={c.priority}
          caseType={c.caseType}
          assignedReviewer={c.assignedReviewer}
          recoveryNeeded={c.recoveryNeeded}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Attachments</h2>
        <form action="/api/attachments/upload" method="post" encType="multipart/form-data" className="flex flex-wrap items-end gap-2 rounded-md border border-border p-4">
          <input type="hidden" name="caseId" value={c.id} />
          <input type="file" name="file" required className="text-sm" />
          <select name="category" className="h-9 rounded-md border border-input bg-background px-2 text-sm">
            {ATTACHMENT_CATEGORIES.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <Button type="submit">Upload</Button>
        </form>
        {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
        <ul className="text-sm">
          {c.attachments.map((a) => (
            <li key={a.id} className="border-t border-border py-1">
              {a.fileName} - {a.attachmentCategory} - {a.sniffedContentType} - evidence: {a.evidenceStatus}
              {a.contentTypeMismatch && (
                <span className="text-destructive"> (declared {a.declaredContentType}, content differs)</span>
              )}
            </li>
          ))}
          {c.attachments.length === 0 && <li className="text-muted-foreground">No attachments.</li>}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Audit trail</h2>
        <ul className="text-sm">
          {c.auditEvents.map((e) => (
            <li key={e.id} className="border-t border-border py-1">
              {e.eventTime.toISOString().slice(0, 19).replace("T", " ")} - {e.actor} - {e.action}
              {(e.previousState || e.newState) && ` (${e.previousState ?? "-"} -> ${e.newState ?? "-"})`}
              {e.notes && ` - ${e.notes}`}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
