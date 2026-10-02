"use client";

import { useActionState } from "react";
import { loadDemoAction } from "@/actions/demo";
import { Button } from "@/components/ui/button";

export function DemoLoadButton({ loaded }: { loaded: boolean }) {
  const [error, run, pending] = useActionState(loadDemoAction, undefined);
  return (
    <form action={run} className="flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={pending}>
        {pending ? "Building the demo..." : loaded ? "Reset demo to its starting state" : "Load demo data"}
      </Button>
      <span className="text-xs text-muted-foreground">
        Replaces only the records flagged as demo; your other data is untouched. Takes a few seconds.
      </span>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </form>
  );
}
