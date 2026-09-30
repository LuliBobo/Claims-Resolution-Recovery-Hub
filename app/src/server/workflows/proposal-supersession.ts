import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { logAuditEvent } from "@/server/audit";

// Current-proposal pointer and supersession primitives (supersession requirement, Part B).
// Every function taking a `tx` MUST be called inside a transaction that first called
// lockCase(): the case-row lock is what serializes regenerate, review, send and reconcile.

export type Tx = Prisma.TransactionClient;
type Reader = Tx | typeof db;

/** Non-terminal proposal statuses: the only ones that can be superseded. */
export const LIVE_STATUSES = ["pending_approval", "approved"] as const;

/** SELECT ... FOR UPDATE on the case row. Always the first lock taken; never take another first. */
export async function lockCase(tx: Tx, caseId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "CustomerCase" WHERE id = ${caseId} FOR UPDATE`;
  if (rows.length === 0) throw new Error(`Case ${caseId} not found`);
}

export interface CurrentState {
  /** The pointer, or the sole live candidate for an un-backfilled legacy case. */
  currentId: string | null;
  /** True when the pointer is NULL and two or more live proposals exist: never guess. */
  needsReconciliation: boolean;
  liveIds: string[];
}

/** Read-only view of which proposal is current. */
export async function describeCurrent(client: Reader, caseId: string): Promise<CurrentState> {
  const c = await client.customerCase.findUniqueOrThrow({
    where: { id: caseId },
    select: { currentResolutionProposalId: true },
  });
  const live = await client.resolutionProposal.findMany({
    where: { linkedCaseId: caseId, status: { in: [...LIVE_STATUSES] } },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  const liveIds = live.map((p) => p.id);
  if (c.currentResolutionProposalId) {
    return { currentId: c.currentResolutionProposalId, needsReconciliation: false, liveIds };
  }
  if (liveIds.length === 1) return { currentId: liveIds[0], needsReconciliation: false, liveIds };
  return { currentId: null, needsReconciliation: liveIds.length >= 2, liveIds };
}

/**
 * Like describeCurrent, but persists the automatic backfill (exactly one live candidate and
 * a NULL pointer is not a choice). Ambiguous cases are left NULL.
 */
export async function resolveCurrent(tx: Tx, caseId: string): Promise<CurrentState> {
  const state = await describeCurrent(tx, caseId);
  const c = await tx.customerCase.findUniqueOrThrow({ where: { id: caseId }, select: { currentResolutionProposalId: true } });
  if (!c.currentResolutionProposalId && state.currentId) {
    await tx.customerCase.update({ where: { id: caseId }, data: { currentResolutionProposalId: state.currentId } });
    await logAuditEvent(
      { caseId, actor: "system", action: "current_proposal_backfilled", newState: state.currentId, notes: "Sole non-terminal proposal" },
      tx,
    );
  }
  return state;
}

/**
 * Supersedes a proposal per rule B.1. Returns false (touching nothing) if it is already
 * sent, rejected or superseded. The linked approval moves to `superseded` ONLY if it was
 * still pending; a recorded human decision is never modified.
 */
export async function supersedeProposal(tx: Tx, proposalId: string, actorLabel: string, note?: string) {
  const p = await tx.resolutionProposal.findUniqueOrThrow({ where: { id: proposalId }, include: { approvals: true } });
  const now = new Date();
  const moved = await tx.resolutionProposal.updateMany({
    where: { id: proposalId, status: { in: [...LIVE_STATUSES] } },
    data: { status: "superseded", supersededAt: now },
  });
  if (moved.count === 0) return false;
  await tx.humanApproval.updateMany({
    where: { linkedResolutionProposalId: proposalId, decision: "pending" },
    data: { decision: "superseded", supersededAt: now },
  });
  const decided = p.approvals.find((a) => a.decision === "approved" || a.decision === "rejected");
  await logAuditEvent(
    {
      caseId: p.linkedCaseId,
      actor: actorLabel,
      action: "resolution_proposal_superseded",
      previousState: p.status,
      newState: "superseded",
      notes:
        [note, decided ? `Recorded ${decided.decision} decision by ${decided.reviewer ?? "unknown"} left untouched` : "No human decision had been recorded"]
          .filter(Boolean)
          .join("; "),
    },
    tx,
  );
  return true;
}

/** Cases whose current proposal cannot be determined, or that have live proposals off the pointer. */
export async function listCasesNeedingReconciliation() {
  return db.$queryRaw<{ id: string; customerName: string; liveCount: number; reason: string }[]>`
    SELECT c.id, c."customerName", count(p.id)::int AS "liveCount",
      CASE WHEN c."currentResolutionProposalId" IS NULL THEN 'ambiguous: no current proposal'
           ELSE 'live proposal not referenced by the current pointer' END AS reason
    FROM "CustomerCase" c
    JOIN "ResolutionProposal" p ON p."linkedCaseId" = c.id AND p.status IN ('pending_approval', 'approved')
    WHERE c."currentResolutionProposalId" IS NULL
       OR p.id <> c."currentResolutionProposalId"
    GROUP BY c.id, c."customerName", c."currentResolutionProposalId"
    HAVING c."currentResolutionProposalId" IS NOT NULL OR count(p.id) >= 2
    ORDER BY c."customerName"`;
}
