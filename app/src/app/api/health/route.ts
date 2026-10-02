import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { db } from "@/server/db";
import { getCarrierGateConfig } from "@/server/evidence/gate-config";

export const dynamic = "force-dynamic";

// Post-deploy check. Anyone gets just ok/degraded plus database reachability. With the cron
// bearer token the response also lists which required settings are present (booleans only,
// never values), so a misconfigured deployment can be diagnosed without exposing anything.
export async function GET(request: Request) {
  let dbOk = false;
  try {
    await db.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }
  const checks = {
    database: dbOk,
    authSecret: Boolean(process.env.AUTH_SECRET),
    cronSecret: Boolean(process.env.CRON_SECRET),
    anthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
    fakeLlmOff: process.env.E2E_FAKE_LLM !== "1",
  };
  const ok = checks.database && checks.authSecret && checks.fakeLlmOff;
  // Informational and only computed for authorized callers (it queries the database): it does not
  // affect ok/degraded, since a fresh database has no reference data yet.
  const authorized = isAuthorizedCron(request);
  const carrierGateActive = authorized && dbOk ? (await getCarrierGateConfig().catch(() => ({ active: false }))).active : false;
  const body = authorized ? { status: ok ? "ok" : "degraded", checks: { ...checks, carrierGateActive } } : { status: ok ? "ok" : "degraded", database: dbOk };
  return NextResponse.json(body, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
