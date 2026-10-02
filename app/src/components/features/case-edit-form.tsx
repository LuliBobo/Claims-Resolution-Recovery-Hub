"use client";

import { useActionState } from "react";
import { updateCaseAction } from "@/actions/cases";
import { Button } from "@/components/ui/button";
import { CASE_TYPES, PRIORITIES, STATUSES } from "@/lib/validation/case";

function Select({ name, label, options, value, disabled }: { name: string; label: string; options: readonly string[]; value: string; disabled?: boolean }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <select name={name} defaultValue={value} disabled={disabled} title={disabled ? "Reviewer or admin only" : undefined} className="h-9 rounded-md border border-input bg-background px-2">
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

export function CaseEditForm({
  id,
  status,
  priority,
  caseType,
  assignedReviewer,
  recoveryNeeded,
  canClassify,
}: {
  id: string;
  status: string;
  priority: string;
  caseType: string;
  assignedReviewer: string | null;
  recoveryNeeded: boolean;
  canClassify: boolean;
}) {
  const [error, action, pending] = useActionState(updateCaseAction.bind(null, id), undefined);
  return (
    <form action={action} className="grid gap-3 rounded-md border border-border p-4 sm:grid-cols-3">
      <Select name="status" label="Status" options={STATUSES} value={status} />
      <Select name="priority" label="Priority" options={PRIORITIES} value={priority} disabled={!canClassify} />
      <Select name="caseType" label="Case type" options={CASE_TYPES} value={caseType} disabled={!canClassify} />
      <label className="flex flex-col gap-1 text-sm">
        Assigned reviewer
        <input name="assignedReviewer" defaultValue={assignedReviewer ?? ""} className="h-9 rounded-md border border-input bg-background px-3" />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="recoveryNeeded" defaultChecked={recoveryNeeded} /> Recovery needed
      </label>
      {error && <p className="text-sm text-destructive sm:col-span-3">{error}</p>}
      <div className="sm:col-span-3">
        <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Save changes"}</Button>
      </div>
    </form>
  );
}
