"use client";

import { useActionState } from "react";
import { reconcileProposalAction } from "@/actions/approvals";
import { Button } from "@/components/ui/button";

export function ReconcileForm({ caseId, proposals }: { caseId: string; proposals: { id: string; label: string }[] }) {
  const [error, action, pending] = useActionState(reconcileProposalAction.bind(null, caseId), undefined);
  return (
    <form action={action} className="flex flex-col gap-2 text-sm">
      <select name="proposalId" required className="h-9 rounded-md border border-input bg-background px-2">
        {proposals.map((p) => (
          <option key={p.id} value={p.id}>{p.label}</option>
        ))}
      </select>
      <input name="comment" required placeholder="Why this one is current (required)" className="h-9 rounded-md border border-input bg-background px-3" />
      <div>
        <Button type="submit" size="sm" disabled={pending}>Set as current</Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
