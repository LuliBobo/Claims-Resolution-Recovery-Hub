import { db } from "@/server/db";
import type { CaseType, InsightTrend } from "@/generated/prisma/client";

// Nightly insight recomputation. Callable manually and from cron: nothing here assumes
// cron-only invocation. Semantics (Luo, verified): aggregate resolved/escalated cases into
// trend records, FULLY replacing the prior set each run.
//
// Assumptions where the spec is silent (flag if wrong):
//  - a case is grouped by (sku, carrier, supplier, warehouse, issue type = caseType);
//  - frequency = number of resolved/escalated cases in the group, all time;
//  - trend compares the group's cases created in the last 30 days against the 30 days before.

export const TREND_WINDOW_DAYS = 30;
const DAY = 86_400_000;

export interface InsightSourceCase {
  createdAt: Date;
  caseType: CaseType;
  sku: string | null;
  supplier: string | null;
  carrier: string | null;
  warehouse: string | null;
}

export interface InsightRow {
  sku: string | null;
  carrier: string | null;
  supplier: string | null;
  warehouse: string | null;
  issueType: CaseType;
  frequency: number;
  trendDirection: InsightTrend;
}

export function computeInsightRows(cases: readonly InsightSourceCase[], now: Date): InsightRow[] {
  const recentStart = now.getTime() - TREND_WINDOW_DAYS * DAY;
  const priorStart = recentStart - TREND_WINDOW_DAYS * DAY;
  const groups = new Map<string, { row: Omit<InsightRow, "frequency" | "trendDirection">; total: number; recent: number; prior: number }>();

  for (const c of cases) {
    const key = JSON.stringify([c.sku, c.carrier, c.supplier, c.warehouse, c.caseType]);
    let g = groups.get(key);
    if (!g) {
      g = { row: { sku: c.sku, carrier: c.carrier, supplier: c.supplier, warehouse: c.warehouse, issueType: c.caseType }, total: 0, recent: 0, prior: 0 };
      groups.set(key, g);
    }
    g.total++;
    const t = c.createdAt.getTime();
    if (t >= recentStart && t <= now.getTime()) g.recent++;
    else if (t >= priorStart && t < recentStart) g.prior++;
  }

  return [...groups.values()]
    .map(({ row, total, recent, prior }) => ({
      ...row,
      frequency: total,
      trendDirection: (recent > prior ? "up" : recent < prior ? "down" : "stable") as InsightTrend,
    }))
    .sort((a, b) => b.frequency - a.frequency || String(a.sku).localeCompare(String(b.sku)));
}

/** Replaces the whole InsightRecord set in one transaction; concurrent runs are serialized. */
export async function recomputeInsights(now: Date = new Date()) {
  const cases = await db.customerCase.findMany({
    where: { status: { in: ["resolved", "escalated"] } },
    select: {
      createdAt: true,
      caseType: true,
      order: { select: { sku: true, supplier: true } },
      shipment: { select: { carrier: true, warehouse: true } },
    },
  });
  const rows = computeInsightRows(
    cases.map((c) => ({
      createdAt: c.createdAt,
      caseType: c.caseType,
      sku: c.order?.sku ?? null,
      supplier: c.order?.supplier ?? null,
      carrier: c.shipment?.carrier ?? null,
      warehouse: c.shipment?.warehouse ?? null,
    })),
    now,
  );

  return db.$transaction(
    async (tx) => {
      // Two overlapping runs (cron + manual) would otherwise both delete, then both insert.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('recompute-insights'))`;
      const removed = await tx.insightRecord.deleteMany();
      const created = await tx.insightRecord.createMany({ data: rows });
      return { removed: removed.count, created: created.count };
    },
    { timeout: 20_000, maxWait: 20_000 },
  );
}
