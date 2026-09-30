"use client";

import { useActionState } from "react";
import { regenerateProposalAction } from "@/actions/cases";
import { Button } from "@/components/ui/button";

export function RegenerateButton({ caseId }: { caseId: string }) {
  const [error, action, pending] = useActionState(regenerateProposalAction.bind(null, caseId), undefined);
  return (
    <form action={action} className="flex items-center gap-3">
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Generating..." : "Generate proposal"}
      </Button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </form>
  );
}
