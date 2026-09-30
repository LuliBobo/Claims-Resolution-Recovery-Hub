import { notFound } from "next/navigation";
import { CaseEditForm } from "@/components/features/case-edit-form";
import { Button } from "@/components/ui/button";
import { ATTACHMENT_CATEGORIES } from "@/lib/validation/case";
import { RegenerateButton } from "@/components/features/regenerate-button";
import { getCase } from "@/server/workflows/case-management";
import { evaluateGateForCase } from "@/server/workflows/proposal-generation";

export const dynamic = "force-dynamic";

export default async function CaseDetailPage(props: PageProps<"/cases/[caseId]">) {
  const { caseId } = await props.params;
  const sp = await props.searchParams;
  const c = await getCase(caseId).catch(() => null);
  if (!c) notFound();
  const gate = await evaluateGateForCase(c.id);
  const uploadError = typeof sp.uploadError === "string" ? sp.uploadError : undefined;

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{c.customerName}</h1>
        <p className="text-sm text-muted-foreground">
          {c.caseType}{c.classificationConfidence != null && ` (confidence ${Math.round(c.classificationConfidence * 100)}%)`} / {c.priority} / {c.status} / via {c.source} / language {c.customerLanguage}
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

      {gate.applies && (
        <section className="flex flex-col gap-2">
          <h2 className="font-medium">Carrier claim evidence checklist</h2>
          <ul className="text-sm">
            <li>{gate.checklist.shippingLabelPhoto ? "[x]" : "[ ]"} Shipping label photo</li>
            <li>{gate.checklist.damagedItemPhoto ? "[x]" : "[ ]"} Damaged item photo</li>
            <li>{gate.checklist.outerCartonPhoto ? "[x]" : "[ ]"} Outer carton photo</li>
          </ul>
          <p className="text-xs text-muted-foreground">
            Recomputed from current attachments on every view. Only attachments with evidence status
            &quot;sufficient&quot; count. The stored proposal updates when you generate a new one.
          </p>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Resolution proposals</h2>
        <RegenerateButton caseId={c.id} />
        {c.resolutionProposals.map((p) => (
          <div key={p.id} className="rounded-md border border-border p-3 text-sm">
            <div className="font-medium">
              {p.recommendation} <span className="font-normal text-muted-foreground">({p.status})</span>
              {p.evidenceGateApplied && <span className="ml-2 text-destructive">evidence gate applied</span>}
            </div>
            <p>{p.rationale}</p>
            <p className="text-muted-foreground">
              Confidence {p.confidence != null ? Math.round(p.confidence * 100) + "%" : "n/a"}. Policy: {p.policySource ?? "none"}. Approval:{" "}
              {p.approvals.map((a) => a.decision).join(", ") || "none"}
            </p>
            {p.customerReplyDraft && (
              <details className="mt-1">
                <summary className="cursor-pointer">Customer reply draft ({c.customerLanguage})</summary>
                <p className="whitespace-pre-wrap">{p.customerReplyDraft}</p>
              </details>
            )}
          </div>
        ))}
        {c.resolutionProposals.length === 0 && <p className="text-sm text-muted-foreground">No proposals yet.</p>}
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
              {a.fileName} - {a.attachmentCategory}{a.photoSubject ? ` (${a.photoSubject})` : ""} - {a.sniffedContentType} - evidence: {a.evidenceStatus}{a.aiNotes ? ` - ${a.aiNotes}` : ""}
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
