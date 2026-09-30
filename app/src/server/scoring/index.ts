import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { REVIEW_ROLES, requireRole, type Actor } from "@/server/auth";
import { db } from "@/server/db";
import { logAuditEvent } from "@/server/audit";
import { evaluateCarrierClaimsGate } from "@/server/evidence/carrier-claims-gate";
import { findActiveRulesForCaseType } from "@/server/reference-data";
import { lockCase, type Tx } from "@/server/workflows/proposal-supersession";
import { defaultCounterpartyType } from "@/server/workflows/recovery-draft";
import { FACTOR_KEYS, scoreCase, type FactorKey, type ScoreInputs, type ScoreOverrides, type WorkflowScore } from "./workflow-score";

type Client = Tx | typeof db;

const overrideSchema = z.object({
  score: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  reason: z.string(),
  by: z.string(),
  at: z.string(),
});
const overridesSchema = z.partialRecord(z.enum(FACTOR_KEYS), overrideSchema);

/** Malformed stored overrides are ignored rather than failing the page. */
export function parseOverrides(raw: unknown): ScoreOverrides {
  const r = overridesSchema.safeParse(raw ?? {});
  return r.success ? (r.data as ScoreOverrides) : {};
}

/** Loads current data and scores the case fresh. Never cached. */
export async function getWorkflowScore(caseId: string, client: Client = db): Promise<WorkflowScore> {
  const c = await client.customerCase.findUniqueOrThrow({
    where: { id: caseId },
    include: {
      order: true,
      shipment: true,
      attachments: { select: { attachmentCategory: true, evidenceStatus: true, photoSubject: true } },
    },
  });
  const rules = await findActiveRulesForCaseType(c.caseType, client);
  const gate = evaluateCarrierClaimsGate({
    caseType: c.caseType,
    matchedPolicyNames: rules.flatMap((r) => (r.linkedPolicyDocument ? [r.linkedPolicyDocument.name] : [])),
    attachments: c.attachments,
  });

  const counterparty = defaultCounterpartyType(c.caseType) === "carrier" ? c.shipment?.carrier : c.order?.supplier;
  const inputs: ScoreInputs = {
    evidence: {
      gateApplies: gate.applies,
      gateMissing: gate.missing.length,
      attachmentCount: c.attachments.length,
      sufficientCount: c.attachments.filter((a) => a.evidenceStatus === "sufficient").length,
      unresolvedCount: c.attachments.filter((a) => a.evidenceStatus === "insufficient" || a.evidenceStatus === "pending_review").length,
      ruleRequiresEvidence: rules.some((r) => Boolean(r.requiredEvidence?.trim())),
    },
    policy: {
      matchedRuleCount: rules.length,
      distinctResolutions: new Set(rules.map((r) => r.recommendedResolution?.trim()).filter(Boolean)).size,
      allLinkedToPolicy: rules.length > 0 && rules.every((r) => r.linkedPolicyDocument !== null),
    },
    priority: c.priority,
    orderValue: c.order ? Number(c.order.orderValue) : null,
    recovery: { needed: c.recoveryNeeded, hasCounterparty: Boolean(counterparty) },
  };
  return scoreCase(inputs, parseOverrides(c.scoreOverrides));
}

export class ScoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScoreError";
  }
}

/**
 * Operator override of one factor (reviewer/admin, reason required), or a reset when
 * `score` is null. Read-modify-write of one JSON column, so it runs under the case-row lock.
 */
export async function setScoreOverride(
  actor: Actor | null,
  caseId: string,
  factor: FactorKey,
  score: 0 | 1 | 2 | 3 | null,
  reason: string,
) {
  const user = requireRole(actor, ...REVIEW_ROLES);
  if (!FACTOR_KEYS.includes(factor)) throw new ScoreError("Unknown factor");
  if (score !== null && !reason.trim()) throw new ScoreError("A reason is required for an override");

  return db.$transaction(
    async (tx) => {
      await lockCase(tx, caseId);
      const row = await tx.customerCase.findUniqueOrThrow({ where: { id: caseId }, select: { scoreOverrides: true } });
      const overrides = parseOverrides(row.scoreOverrides);
      const before = overrides[factor]?.score ?? null;
      if (score === null) delete overrides[factor];
      else overrides[factor] = { score, reason: reason.trim(), by: user.email, at: new Date().toISOString() };

      await tx.customerCase.update({
        where: { id: caseId },
        data: { scoreOverrides: Object.keys(overrides).length ? (overrides as Prisma.InputJsonValue) : Prisma.DbNull },
      });
      await logAuditEvent(
        {
          caseId,
          actor: user.email,
          action: score === null ? "score_override_cleared" : "score_override_set",
          previousState: before === null ? null : `${factor}=${before}`,
          newState: score === null ? null : `${factor}=${score}`,
          notes: score === null ? null : reason.trim(),
        },
        tx,
      );
      return getWorkflowScore(caseId, tx);
    },
    { timeout: 20_000, maxWait: 20_000 },
  );
}
