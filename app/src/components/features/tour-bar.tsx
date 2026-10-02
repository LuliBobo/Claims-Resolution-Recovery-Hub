"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { addCartonPhotoAction } from "@/actions/demo";
import { Button } from "@/components/ui/button";

interface Step {
  n: number;
  title: string;
  seconds: number;
  show: string[];
  say: string;
  action: "add-carton" | null;
  href: string;
}

/** Guided-demo overlay: shown on any page opened with ?demo=N while demo mode is on. */
export function TourBar() {
  const n = useSearchParams().get("demo");
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [error, run, pending] = useActionState(addCartonPhotoAction, undefined);

  useEffect(() => {
    if (n === null) return;
    let alive = true;
    fetch("/api/demo/tour", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => alive && setSteps(j?.steps ?? null))
      .catch(() => alive && setSteps(null));
    return () => {
      alive = false;
    };
  }, [n, pending]);

  if (n === null || !steps) return null;
  const i = steps.findIndex((s) => String(s.n) === n);
  if (i < 0) return null;
  const s = steps[i];
  const prev = steps[i - 1];
  const next = steps[i + 1];
  return (
    <div role="region" aria-label="Guided demo" className="sticky top-0 z-20 border-b border-border bg-background px-6 py-3 text-sm shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium">
          Demo step {s.n} of {steps.length - 1}: {s.title} <span className="font-normal text-muted-foreground">({s.seconds}s)</span>
        </div>
        <div className="flex gap-2">
          {prev && <Link className="underline" href={prev.href}>Back</Link>}
          <Link className="underline" href="/demo">All steps</Link>
          {next && <Link className="font-medium underline" href={next.href}>Next: {next.title}</Link>}
        </div>
      </div>
      <ul className="mt-1 list-disc pl-5 text-muted-foreground">
        {s.show.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      <p className="mt-1 italic">&ldquo;{s.say}&rdquo;</p>
      {s.action === "add-carton" && (
        <form action={run} className="mt-2 flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" disabled={pending}>{pending ? "Adding..." : "Demo shortcut: customer sends the outer-box photo"}</Button>
          <span className="text-xs text-muted-foreground">Attaches a placeholder photo marked sufficient and regenerates the proposal with the real workflow. Real uploads are judged by the AI.</span>
          {error && <span className="text-xs text-destructive">{error}</span>}
        </form>
      )}
    </div>
  );
}
