"use client";

import { useActionState } from "react";
import { reviewApprovalAction } from "@/actions/approvals";
import { Button } from "@/components/ui/button";

export function ReviewForm({ approvalId }: { approvalId: string }) {
  const [error, action, pending] = useActionState(reviewApprovalAction.bind(null, approvalId), undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input name="comment" placeholder="Comment (optional)" className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
      <div className="flex gap-2">
        <Button type="submit" name="decision" value="approved" size="sm" disabled={pending}>Approve</Button>
        <Button type="submit" name="decision" value="rejected" size="sm" variant="destructive" disabled={pending}>Reject</Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
