import Link from "next/link";
import { ReviewForm } from "@/components/features/review-form";
import { getActor } from "@/lib/session";
import { REVIEW_ROLES } from "@/server/auth";
import { listCasesNeedingReconciliation } from "@/server/workflows/proposal-supersession";
import { listPendingApprovals } from "@/server/workflows/review-approval";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const [actor, approvals, needReconcile] = await Promise.all([getActor(), listPendingApprovals(), listCasesNeedingReconciliation()]);
  const canReview = !!actor && REVIEW_ROLES.includes(actor.role);
  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <h1 className="text-xl font-semibold">Approvals queue</h1>
      {!canReview && <p className="text-sm text-muted-foreground">Read-only: reviewing requires the reviewer or admin role.</p>}
      {needReconcile.length > 0 && (
        <div className="rounded-md border border-border bg-muted p-3 text-sm">
          <p className="font-medium">Cases needing manual reconciliation</p>
          <ul>
            {needReconcile.map((r) => (
              <li key={r.id}>
                <Link className="underline" href={`/cases/${r.id}`}>{r.customerName}</Link>: {r.reason} ({r.liveCount} live)
              </li>
            ))}
          </ul>
        </div>
      )}
      {approvals.length === 0 && <p className="text-sm text-muted-foreground">Nothing is waiting for approval.</p>}
      {approvals.map((a) => (
        <div key={a.id} className="flex flex-col gap-2 rounded-md border border-border p-4 text-sm">
          <div className="flex items-center justify-between">
            <Link className="font-medium underline" href={`/cases/${a.linkedCaseId}`}>
              {a.case.customerName}
            </Link>
            <span className="text-muted-foreground">{a.approvalType === "resolution_proposal" ? "Resolution proposal" : "Recovery draft"}</span>
          </div>
          {a.resolutionProposal && (
            <div>
              <div className="font-medium">
                {a.resolutionProposal.recommendation}
                {a.resolutionProposal.evidenceGateApplied && <span className="ml-2 text-destructive">evidence gate applied</span>}
              </div>
              <p>{a.resolutionProposal.rationale}</p>
            </div>
          )}
          {a.recoveryDraft && (
            <div>
              <div className="font-medium">
                {a.recoveryDraft.claimType} to {a.recoveryDraft.counterpartyName} ({a.recoveryDraft.counterpartyType})
                {a.recoveryDraft.estimatedRecoverableValue != null && `, est. ${a.recoveryDraft.estimatedRecoverableValue.toString()}`}
              </div>
              <p className="whitespace-pre-wrap">{a.recoveryDraft.draftText}</p>
            </div>
          )}
          {canReview && <ReviewForm approvalId={a.id} />}
        </div>
      ))}
    </div>
  );
}
