"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";

// Button wired to a bound Server Action that returns an error string or undefined.
export function ActionButton({
  action,
  label,
  pendingLabel = "Working...",
  variant = "outline",
}: {
  action: () => Promise<string | undefined>;
  label: string;
  pendingLabel?: string;
  variant?: "default" | "outline" | "destructive";
}) {
  const [error, formAction, pending] = useActionState(() => action(), undefined);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <Button type="submit" size="sm" variant={variant} disabled={pending}>
        {pending ? pendingLabel : label}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </form>
  );
}
