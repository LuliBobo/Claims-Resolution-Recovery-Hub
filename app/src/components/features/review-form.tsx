"use client";

import { useActionState } from "react";
import { reviewApprovalAction } from "@/actions/approvals";
import { Button } from "@/components/ui/button";

export type ReviewOriginal =
  | { kind: "proposal"; recommendation: string; rationale: string; customerReplyDraft: string | null }
  | { kind: "draft"; claimType: string; draftText: string; estimatedRecoverableValue: string | null };

const input = "rounded-md border border-input bg-background px-3 text-sm";

export function ReviewForm({ approvalId, original }: { approvalId: string; original: ReviewOriginal }) {
  const [error, action, pending] = useActionState(reviewApprovalAction.bind(null, approvalId), undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      <details className="rounded-md border border-border p-2 text-sm">
        <summary className="cursor-pointer">Edit before approving</summary>
        <div className="mt-2 flex flex-col gap-2">
          {original.kind === "proposal" ? (
            <>
              <label className="flex flex-col gap-1">Recommendation
                <input name="edit_recommendation" defaultValue={original.recommendation} className={`h-9 ${input}`} />
              </label>
              <label className="flex flex-col gap-1">Rationale
                <textarea name="edit_rationale" defaultValue={original.rationale} rows={3} className={`py-2 ${input}`} />
              </label>
              {original.customerReplyDraft !== null && (
                <label className="flex flex-col gap-1">Customer reply draft
                  <textarea name="edit_customerReplyDraft" defaultValue={original.customerReplyDraft} rows={4} className={`py-2 ${input}`} />
                </label>
              )}
            </>
          ) : (
            <>
              <label className="flex flex-col gap-1">Claim type
                <input name="edit_claimType" defaultValue={original.claimType} className={`h-9 ${input}`} />
              </label>
              <label className="flex flex-col gap-1">Claim text
                <textarea name="edit_draftText" defaultValue={original.draftText} rows={5} className={`py-2 ${input}`} />
              </label>
              <label className="flex flex-col gap-1">Estimated recoverable value
                <input name="edit_estimatedRecoverableValue" type="number" step="any" min="0" defaultValue={original.estimatedRecoverableValue ?? ""} className={`h-9 ${input}`} />
              </label>
            </>
          )}
        </div>
      </details>
      <input name="comment" placeholder="Comment (required to request more evidence)" className={`h-9 ${input}`} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="decision" value="approved" size="sm" disabled={pending}>Approve</Button>
        <Button type="submit" name="decision" value="approved_with_edits" size="sm" variant="outline" disabled={pending}>Approve with edits</Button>
        <Button type="submit" name="decision" value="evidence_requested" size="sm" variant="outline" disabled={pending}>Request more evidence</Button>
        <Button type="submit" name="decision" value="rejected" size="sm" variant="destructive" disabled={pending}>Reject</Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
