"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";

type Action = (prev: string | undefined, fd: FormData) => Promise<string | undefined>;

// Generic form wired to a Server Action that returns an error string or undefined.
export function ActionForm({
  action,
  submitLabel,
  children,
}: {
  action: Action;
  submitLabel: string;
  children: React.ReactNode;
}) {
  const [error, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="grid gap-3 rounded-md border border-border p-4 sm:grid-cols-2">
      {children}
      {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function Field({
  name,
  label,
  type = "text",
  required,
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        step={type === "number" ? "any" : undefined}
        className="h-9 rounded-md border border-input bg-background px-3"
      />
    </label>
  );
}

export function SelectField({
  name,
  label,
  options,
  required,
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <select name={name} required={required} className="h-9 rounded-md border border-input bg-background px-2">
        {!required && <option value="">-</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
