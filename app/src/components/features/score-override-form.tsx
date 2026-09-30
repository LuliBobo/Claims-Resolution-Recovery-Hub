"use client";

import { useActionState } from "react";
import { scoreOverrideAction } from "@/actions/scoring";
import { Button } from "@/components/ui/button";
import { FACTOR_LABELS, FACTOR_KEYS } from "@/server/scoring/workflow-score";

export function ScoreOverrideForm({ caseId }: { caseId: string }) {
  const [error, action, pending] = useActionState(scoreOverrideAction.bind(null, caseId), undefined);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2 text-sm">
      <label className="flex flex-col gap-1">
        Factor
        <select name="factor" className="h-9 rounded-md border border-input bg-background px-2">
          {FACTOR_KEYS.map((k) => (
            <option key={k} value={k}>{FACTOR_LABELS[k]}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        Score
        <select name="score" className="h-9 rounded-md border border-input bg-background px-2">
          {[0, 1, 2, 3].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
          <option value="reset">reset to derived</option>
        </select>
      </label>
      <input name="reason" placeholder="Reason (required to override)" className="h-9 min-w-64 flex-1 rounded-md border border-input bg-background px-3" />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>Apply</Button>
      {error && <p className="w-full text-xs text-destructive">{error}</p>}
    </form>
  );
}
