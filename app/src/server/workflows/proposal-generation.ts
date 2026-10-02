import { db } from "@/server/db";
import { logAuditEvent } from "@/server/audit";
import {
  applyGateToProposal,
  evaluateCarrierClaimsGate,
  type GateResult,
} from "@/server/evidence/carrier-claims-gate";
import { generateProposal, type GeneratedProposal, type ProposalContext } from "@/server/llm/generate-proposal";
import { findActiveRulesForCaseType } from "@/server/reference-data";
import type { Prisma } from "@/generated/prisma/client";
import { resolveCitations } from "@/server/policy/citations";
import { buildSearchTerms } from "@/server/policy/chunk";
import { searchPolicyPassages } from "@/server/policy/search";
import { lockCase, resolveCurrent, supersedeProposal, type Tx } from "./proposal-supersession";

export interface ProposalDeps {
  generate: (ctx: ProposalContext) => Promise<GeneratedProposal>;
}
const defaultDeps: ProposalDeps = { generate: generateProposal };

export class ReconciliationRequiredError extends Error {
  constructor() {
    super("This case has several live proposals and no current one. An admin must reconcile it before a new proposal can be generated.");
    this.name = "ReconciliationRequiredError";
  }
}

/** Loads current attachments and evaluates the gate fresh. Never cached. */
export async function evaluateGateForCase(caseId: string, client: Tx | typeof db = db): Promise<GateResult> {
  const c = await client.customerCase.findUniqueOrThrow({
    where: { id: caseId },
    select: { caseType: true, attachments: { select: { attachmentCategory: true, evidenceStatus: true, photoSubject: true } } },
  });
  const rules = await findActiveRulesForCaseType(c.caseType, client);
  return evaluateCarrierClaimsGate({
    caseType: c.caseType,
    matchedPolicyNames: rules.flatMap((r) => (r.linkedPolicyDocument ? [r.linkedPolicyDocument.name] : [])),
    attachments: c.attachments,
  });
}

/**
 * Shared by case intake and regenerate. Two phases:
 *  1. Outside any transaction: gather context and call the LLM (slow, must not hold locks).
 *  2. One transaction that locks the CustomerCase row (SELECT ... FOR UPDATE), re-evaluates
 *     the evidence gate against current attachments, creates the proposal + pending
 *     HumanApproval, supersedes the previously-current proposal per rule B.1 and swaps the
 *     current pointer. Concurrent regenerations serialize on the lock, so a case can never
 *     end with two live proposals.
 * Throws if the LLM fails or the case needs reconciliation. `actorLabel` is for the audit
 * trail only; authorization is the caller's job.
 */
export async function generateResolutionProposal(actorLabel: string, caseId: string, deps: ProposalDeps = defaultDeps) {
  const c = await db.customerCase.findUniqueOrThrow({
    where: { id: caseId },
    include: { order: true, shipment: true },
  });
  const rulesForPrompt = await findActiveRulesForCaseType(c.caseType);

  // Deterministic retrieval of verbatim policy passages (documents linked to the matched rules rank higher).
  const hits = await searchPolicyPassages(
    buildSearchTerms([
      c.caseType.replace(/_/g, " "),
      c.internalEnglishSummary ?? c.complaintText,
      c.order?.productName,
      ...rulesForPrompt.flatMap((r) => [r.ruleName, r.requiredEvidence, r.recommendedResolution]),
    ]),
    rulesForPrompt.flatMap((r) => (r.linkedPolicyDocumentId ? [r.linkedPolicyDocumentId] : [])),
  );
  const policyExcerpts = hits.map(({ id, document, version, page, text }) => ({ id, document, version, page, text }));

  const generated = await deps.generate({
    policyExcerpts,
    caseType: c.caseType,
    priority: c.priority,
    customerLanguage: c.customerLanguage,
    complaintText: c.complaintText,
    internalEnglishSummary: c.internalEnglishSummary,
    order: c.order && {
      productName: c.order.productName,
      sku: c.order.sku,
      quantity: c.order.quantity,
      orderValue: c.order.orderValue.toString(),
    },
    shipment: c.shipment && { carrier: c.shipment.carrier, deliveryStatus: c.shipment.deliveryStatus },
    rules: rulesForPrompt.map((r) => ({
      ruleName: r.ruleName,
      requiredEvidence: r.requiredEvidence,
      recommendedResolution: r.recommendedResolution,
      escalationPath: r.escalationPath,
      policyName: r.linkedPolicyDocument?.name ?? null,
      policyVersion: r.linkedPolicyDocument?.version ?? null,
      policySummary: r.linkedPolicyDocument?.summary ?? null,
    })),
  });

  // Only excerpts the AI was actually shown can be cited; each is snapshotted verbatim.
  const { citations, ignored } = resolveCitations(generated.citedExcerptIds, policyExcerpts);

  return db.$transaction(
    async (tx) => {
      await lockCase(tx, caseId);

      const before = await resolveCurrent(tx, caseId);
      if (before.needsReconciliation) throw new ReconciliationRequiredError();

      const gate = await evaluateGateForCase(caseId, tx);
      const final = applyGateToProposal(generated, gate);

      const proposal = await tx.resolutionProposal.create({
        data: {
          linkedCaseId: caseId,
          recommendation: final.recommendation,
          rationale: final.rationale,
          confidence: final.confidence,
          customerImpact: final.customerImpact,
          businessExposure: final.businessExposure,
          policySource: final.policySource,
          needsHumanApproval: final.needsHumanApproval,
          customerReplyDraft: final.customerReplyDraft,
          evidenceGateApplied: final.evidenceGateApplied,
          citations: citations as unknown as Prisma.InputJsonValue,
        },
      });
      const approval = await tx.humanApproval.create({
        data: { linkedCaseId: caseId, approvalType: "resolution_proposal", linkedResolutionProposalId: proposal.id },
      });

      // Supersede the old current proposal (no-op if it is sent/rejected), then swap the pointer.
      if (before.currentId) {
        await supersedeProposal(tx, before.currentId, actorLabel, `Replaced by ${proposal.id}`);
      }
      const swapped = await tx.customerCase.updateMany({
        where: { id: caseId, currentResolutionProposalId: before.currentId }, // NULL-safe compare-and-set
        data: { currentResolutionProposalId: proposal.id, resolutionRecommendation: final.recommendation },
      });
      if (swapped.count === 0) throw new Error("Current proposal changed unexpectedly; aborting");

      await logAuditEvent(
        {
          caseId,
          actor: actorLabel,
          action: "resolution_proposal_generated",
          newState: proposal.status,
          ruleSource: final.policySource,
          notes:
            [
              final.evidenceGateApplied
                ? `Evidence gate overrode the recommendation (LLM proposed "${generated.recommendation}"); missing: ${gate.missing.join(", ")}`
                : null,
              `${citations.length} policy excerpt(s) cited of ${policyExcerpts.length} retrieved`,
              ignored ? `${ignored} cited id(s) were not among the retrieved excerpts and were dropped` : null,
            ]
              .filter(Boolean)
              .join("; ") || null,
        },
        tx,
      );
      // Guarded auto-advance: new -> awaiting_approval only, never touches later statuses.
      const advanced = await tx.customerCase.updateMany({ where: { id: caseId, status: "new" }, data: { status: "awaiting_approval" } });
      if (advanced.count > 0) {
        await logAuditEvent({ caseId, actor: "system", action: "status_changed", previousState: "new", newState: "awaiting_approval" }, tx);
      }
      return { proposal, approval, gate };
    },
    { timeout: 20_000, maxWait: 20_000 },
  );
}
