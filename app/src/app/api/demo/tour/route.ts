import { NextResponse } from "next/server";
import { getActor } from "@/lib/session";
import { isDemoEnabled } from "@/server/demo/config";
import { getDemoState } from "@/server/demo/reset";
import { resolveTour } from "@/server/demo/tour";

export const dynamic = "force-dynamic";

// Feeds the tour bar. 404 unless demo mode is on; sign-in required.
export async function GET() {
  if (!isDemoEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await getActor())) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const d = await getDemoState();
  return NextResponse.json({ loaded: d.loaded, state: d.state, steps: resolveTour({ vaseId: d.vaseId, wrongId: d.wrongId }) }, { headers: { "Cache-Control": "no-store" } });
}
