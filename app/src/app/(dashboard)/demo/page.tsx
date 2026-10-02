import Link from "next/link";
import { notFound } from "next/navigation";
import { DemoLoadButton } from "@/components/features/demo-load-button";
import { getActor } from "@/lib/session";
import { isDemoEnabled } from "@/server/demo/config";
import { getDemoState } from "@/server/demo/reset";
import { stepDone, stepHref, TOUR_STEPS, totalSeconds } from "@/server/demo/tour";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function DemoPage() {
  if (!isDemoEnabled()) notFound();
  const [actor, d] = await Promise.all([getActor(), getDemoState()]);
  const ctx = { vaseId: d.vaseId, wrongId: d.wrongId };
  const total = totalSeconds();
  const isAdmin = actor?.role === "admin";
  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Guided demo</h1>
        <p className="text-sm text-muted-foreground">
          About {Math.floor(total / 60)} minutes {total % 60} seconds. One story: a Spanish complaint about a broken vase becomes a customer
          replacement and a carrier recovery claim, with a human approving and every step logged.
        </p>
      </div>

      <section className="flex flex-col gap-2 rounded-md border border-border p-4 text-sm">
        <h2 className="font-medium">Before you start</h2>
        <ul className="list-disc pl-5">
          <li>Sign in as <strong>admin</strong> (it can approve, reset and use every step).</li>
          <li>The demo data is pre-generated, so it works with no AI key: nothing in it waits on a live AI call.</li>
          <li>Reset between runs to get back to the known starting state.</li>
          <li>Labels on every page say: prototype, human approval required, nothing is sent outside.</li>
        </ul>
        {isAdmin ? <DemoLoadButton loaded={d.loaded} /> : <p className="text-muted-foreground">Only an admin can load or reset the demo data.</p>}
      </section>

      {d.loaded ? (
        <ol className="flex flex-col gap-2">
          {TOUR_STEPS.map((s) => {
            const done = stepDone(s, d.state);
            return (
              <li key={s.n} className="rounded-md border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link className="font-medium underline" href={stepHref(s, ctx)}>
                    {s.n}. {s.title}
                  </Link>
                  <span className="text-muted-foreground">
                    {s.seconds}s{done === null ? "" : done ? " | done" : " | to do"}
                  </span>
                </div>
                <p className="mt-1 italic text-muted-foreground">&ldquo;{s.say}&rdquo;</p>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">Load the demo data to see the steps.</p>
      )}

      {d.loaded && d.wrongId && (
        <section className="text-sm">
          <h2 className="font-medium">Second scenario (optional)</h2>
          <p className="text-muted-foreground">An English complaint about the wrong item from a supplier: replacement recommendation and a supplier claim.</p>
          <Link className="underline" href={`/cases/${d.wrongId}`}>Open the wrong-item case</Link>
        </section>
      )}
    </div>
  );
}
