import { db } from "@/server/db";
import { evaluateCarrierClaimsGate } from "@/server/evidence/carrier-claims-gate";
import { findActiveRulesForCaseType } from "@/server/reference-data";
import { listCasesNeedingReconciliation } from "@/server/workflows/proposal-supersession";

// Read-only KPIs, scoped to open cases: status NOT IN (resolved, closed).
const OPEN = { notIn: ["resolved", "closed"] as ("resolved" | "closed")[] };

export async function getOperationsSummary() {
  const [byStatus, byPriority, byType, pendingApprovals, drafts, reconcile, damagedOpen] = await Promise.all([
    db.customerCase.groupBy({ by: ["status"], where: { status: OPEN }, _count: true }),
    db.customerCase.groupBy({ by: ["priority"], where: { status: OPEN }, _count: true }),
    db.customerCase.groupBy({ by: ["caseType"], where: { status: OPEN }, _count: true }),
    db.humanApproval.count({ where: { decision: "pending", case: { status: OPEN } } }),
    db.recoveryDraft.findMany({
      where: { status: { in: ["draft", "pending_approval", "approved"] }, case: { status: OPEN } },
      select: { estimatedRecoverableValue: true },
    }),
    listCasesNeedingReconciliation(),
    db.customerCase.findMany({
      where: { status: OPEN, caseType: "damaged_delivery" },
      select: { id: true, attachments: { select: { attachmentCategory: true, evidenceStatus: true, photoSubject: true } } },
    }),
  ]);

  // Cases waiting for evidence: the carrier gate applies and is incomplete (fresh, never cached).
  const rules = await findActiveRulesForCaseType("damaged_delivery");
  const policyNames = rules.flatMap((r) => (r.linkedPolicyDocument ? [r.linkedPolicyDocument.name] : []));
  const awaitingEvidence = damagedOpen.filter((c) => {
    const g = evaluateCarrierClaimsGate({ caseType: "damaged_delivery", matchedPolicyNames: policyNames, attachments: c.attachments });
    return g.applies && !g.evidenceComplete;
  }).length;

  const total = (rows: { _count: number }[]) => rows.reduce((s, r) => s + r._count, 0);
  return {
    openCases: total(byStatus),
    byStatus: byStatus.map((r) => ({ label: r.status, count: r._count })),
    byPriority: byPriority.map((r) => ({ label: r.priority, count: r._count })),
    byType: byType.map((r) => ({ label: r.caseType, count: r._count })),
    pendingApprovals,
    awaitingEvidence,
    casesNeedingReconciliation: reconcile.length,
    openRecoveryDrafts: drafts.length,
    openRecoverableValue: drafts.reduce((s, d) => s + (d.estimatedRecoverableValue ? Number(d.estimatedRecoverableValue) : 0), 0),
  };
}
