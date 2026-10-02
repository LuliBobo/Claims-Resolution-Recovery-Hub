import { db } from "@/server/db";
import { notFound } from "next/navigation";
import { CaseEditForm } from "@/components/features/case-edit-form";
import { Button } from "@/components/ui/button";
import { ATTACHMENT_CATEGORIES } from "@/lib/validation/case";
import { markProposalSentAction, regenerateRecoveryDraftAction, sendRecoveryDraftAction } from "@/actions/approvals";
import { ActionButton } from "@/components/features/action-button";
import { ScoreOverrideForm } from "@/components/features/score-override-form";
import { getWorkflowScore } from "@/server/scoring";
import { REVIEW_ROLES } from "@/server/auth";
import { ReconcileForm } from "@/components/features/reconcile-form";
import { approvalSummary, proposalLabel } from "@/lib/proposal-label";
import { getActor } from "@/lib/session";
import { describeCurrent } from "@/server/workflows/proposal-supersession";
import { draftEvidenceRequestAction } from "@/actions/messages";
import { MessageDraftCard } from "@/components/features/message-draft-card";
import { getMissingEvidence } from "@/server/workflows/customer-message";
import { Citations } from "@/components/features/citations";
import { RegenerateButton } from "@/components/features/regenerate-button";
import { getCase } from "@/server/workflows/case-management";
import { evaluateGateForCase } from "@/server/workflows/proposal-generation";

export const dynamic = "force-dynamic";
// LLM calls happen in this route (or the actions it hosts); allow more than the platform default.
export const maxDuration = 60;

export default async function CaseDetailPage(props: PageProps<"/cases/[caseId]">) {
  const { caseId } = await props.params;
  const sp = await props.searchParams;
  const c = await getCase(caseId).catch(() => null);
  if (!c) notFound();
  const [gate, current, actor, score, missing] = await Promise.all([evaluateGateForCase(c.id), describeCurrent(db, c.id), getActor(), getWorkflowScore(c.id), getMissingEvidence(c.id)]);
  const uploadError = typeof sp.uploadError === "string" ? sp.uploadError : undefined;

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">
          {c.customerName}
          {c.isDemo && <span className="ml-2 rounded border border-border px-1.5 py-0.5 align-middle text-xs font-medium text-muted-foreground">DEMO</span>}
        </h1>
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

      <section id="evidence" className="flex scroll-mt-56 flex-col gap-2">
        <h2 className="font-medium">Workflow score</h2>
        <p className="text-sm">
          <span className="text-lg font-semibold">{score.total}/15</span>: {score.routeLabel}
        </p>
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr><th className="py-1">Factor</th><th>Score</th><th>Level</th><th>Why</th></tr>
          </thead>
          <tbody>
            {score.factors.map((f) => (
              <tr key={f.key} className="border-t border-border align-top">
                <td className="py-1">{f.label}</td>
                <td>{f.score}{f.override && ` (derived ${f.derivedScore})`}</td>
                <td>{f.level}</td>
                <td>{f.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-muted-foreground">
          Prototype workflow assumptions, not legal or regulatory standards. Thresholds: 0-4 quick review, 5-7 request
          evidence or supervisor check, 8-10 human approval required, 11-15 escalate with no automatic closure (agents
          cannot close such a case). The score is recomputed from current data on every view; the AI cannot change it.
        </p>
        {actor && REVIEW_ROLES.includes(actor.role) ? (
          <ScoreOverrideForm caseId={c.id} />
        ) : (
          <p className="text-xs text-muted-foreground">Only a reviewer or admin can override a factor.</p>
        )}
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
        <h2 className="font-medium">Customer evidence request</h2>
        {missing.length > 0 ? (
          <>
            <p className="text-sm text-muted-foreground">Still needed from the customer (recomputed from current evidence):</p>
            <ul className="list-disc pl-5 text-sm">
              {missing.map((m) => (
                <li key={m.text}>{m.text}</li>
              ))}
            </ul>
            <ActionButton action={draftEvidenceRequestAction.bind(null, c.id)} label="Draft request to customer" pendingLabel="Drafting..." />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing is missing from the customer.</p>
        )}
        {c.messageDrafts
          .filter((m) => m.status === "draft")
          .map((m) => (
            <MessageDraftCard key={m.id} id={m.id} caseId={c.id} body={m.body} language={m.language} items={m.missingItems as string[]} />
          ))}
        {c.messageDrafts
          .filter((m) => m.status === "sent")
          .map((m) => (
            <details key={m.id} className="rounded-md border border-border p-3 text-sm">
              <summary className="cursor-pointer">
                Sent by {m.sentBy} on {m.sentAt?.toISOString().slice(0, 16).replace("T", " ")} UTC (manual attestation)
              </summary>
              <p className="mt-2 whitespace-pre-wrap">{m.body}</p>
            </details>
          ))}
      </section>

      <section id="proposals" className="flex scroll-mt-56 flex-col gap-2">
        <h2 className="font-medium">Resolution proposals</h2>
        {current.needsReconciliation && (
          <div className="rounded-md border border-border bg-muted p-3 text-sm">
            <p className="mb-2 font-medium">
              This case has {current.liveIds.length} live proposals and no current one. Sending is blocked until an admin reconciles it.
            </p>
            {actor?.role === "admin" ? (
              <ReconcileForm
                caseId={c.id}
                proposals={c.resolutionProposals
                  .filter((p) => current.liveIds.includes(p.id))
                  .map((p) => ({ id: p.id, label: `${p.recommendation} (${p.status}, ${p.createdAt.toISOString().slice(0, 10)})` }))}
              />
            ) : (
              <p className="text-muted-foreground">Only an admin can reconcile it.</p>
            )}
          </div>
        )}
        {!current.needsReconciliation && <RegenerateButton caseId={c.id} />}
        {c.resolutionProposals.map((p) => {
          const label = proposalLabel(p, current.currentId);
          return (
          <div key={p.id} className={`rounded-md border p-3 text-sm ${label.badge === "Current" ? "border-primary" : "border-border"} ${label.badge === "Superseded" ? "opacity-70" : ""}`}>
            {label.badge && (
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide">{label.badge}</div>
            )}
            {label.badge === "Superseded" && <div className="mb-1 text-xs text-muted-foreground">{label.text}</div>}
            <div className="font-medium">
              {p.recommendation} <span className="font-normal text-muted-foreground">({p.status})</span>
              {p.evidenceGateApplied && <span className="ml-2 text-destructive">evidence gate applied</span>}
            </div>
            <p>{p.rationale}</p>
            <p className="text-muted-foreground">
              Confidence {p.confidence != null ? Math.round(p.confidence * 100) + "%" : "n/a"}. Policy: {p.policySource ?? "none"}. Approval:{" "}
              {approvalSummary(p.approvals)}
            </p>
            <Citations citations={p.citations} />
            {p.status === "approved" && p.id === current.currentId && (
              <div className="mt-2">
                <ActionButton action={markProposalSentAction.bind(null, p.id, c.id)} label="Mark as sent (manual attestation)" />
              </div>
            )}
            {p.customerReplyDraft && (
              <details className="mt-1">
                <summary className="cursor-pointer">Customer reply draft ({c.customerLanguage})</summary>
                <p className="whitespace-pre-wrap">{p.customerReplyDraft}</p>
              </details>
            )}
          </div>
          );
        })}
        {c.resolutionProposals.length === 0 && <p className="text-sm text-muted-foreground">No proposals yet.</p>}
      </section>

      <section id="recovery" className="flex scroll-mt-56 flex-col gap-2">
        <h2 className="font-medium">Recovery drafts</h2>
        <ActionButton action={regenerateRecoveryDraftAction.bind(null, c.id)} label="Generate recovery draft" pendingLabel="Generating..." />
        {c.recoveryDrafts.map((d) => (
          <div key={d.id} className="rounded-md border border-border p-3 text-sm">
            <div className="font-medium">
              {d.claimType} to {d.counterpartyName} ({d.counterpartyType}){" "}
              <span className="font-normal text-muted-foreground">({d.status})</span>
              {d.estimatedRecoverableValue != null && `, est. ${d.estimatedRecoverableValue.toString()}`}
            </div>
            <p className="whitespace-pre-wrap">{d.draftText}</p>
            <p className="text-muted-foreground">Approval: {approvalSummary(d.approvals)}</p>
            {d.status === "approved" && (
              <div className="mt-2">
                <ActionButton action={sendRecoveryDraftAction.bind(null, d.id, c.id)} label="Mark as sent (manual attestation)" />
              </div>
            )}
          </div>
        ))}
        {c.recoveryDrafts.length === 0 && <p className="text-sm text-muted-foreground">No recovery drafts yet.</p>}
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
              <a className="underline" href={`/api/attachments/${a.id}/download`}>{a.fileName}</a> - {a.attachmentCategory}{a.photoSubject ? ` (${a.photoSubject})` : ""}{a.sniffedContentType ? ` - ${a.sniffedContentType}` : ""} - evidence: {a.evidenceStatus}{a.aiNotes ? ` - ${a.aiNotes}` : ""}
              {a.contentTypeMismatch && (
                <span className="text-destructive"> (declared {a.declaredContentType}, content differs)</span>
              )}
            </li>
          ))}
          {c.attachments.length === 0 && <li className="text-muted-foreground">No attachments.</li>}
        </ul>
      </section>

      <section id="audit" className="flex scroll-mt-56 flex-col gap-2">
        <h2 className="font-medium">Audit trail</h2>
        <ul className="text-sm">
          {c.auditEvents.map((e) => (
            <li key={e.id} className="border-t border-border py-1">
              {e.eventTime.toISOString().slice(0, 19).replace("T", " ")} - {e.actor} - {e.action}
              {e.previousState && e.newState ? ` (${e.previousState} -> ${e.newState})` : e.newState ? ` (${e.newState})` : ""}
              {e.notes && ` - ${e.notes}`}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
