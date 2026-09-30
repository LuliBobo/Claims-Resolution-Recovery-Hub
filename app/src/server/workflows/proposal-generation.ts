import { db } from "@/server/db";
import { logAuditEvent } from "@/server/audit";
import {
  applyGateToProposal,
  evaluateCarrierClaimsGate,
  type GateResult,
} from "@/server/evidence/carrier-claims-gate";
import { generateProposal, type GeneratedProposal, type ProposalContext } from "@/server/llm/generate-proposal";
import { findActiveRulesForCaseType } from "@/server/reference-data";

export interface ProposalDeps {
  generate: (ctx: ProposalContext) => Promise<GeneratedProposal>;
}
const defaultDeps: ProposalDeps = { generate: generateProposal };

/** Loads current attachments and evaluates the gate fresh. Never cached. */
export async function evaluateGateForCase(caseId: string): Promise<GateResult> {
  const c = await db.customerCase.findUniqueOrThrow({
    where: { id: caseId },
    select: { caseType: true, attachments: { select: { attachmentCategory: true, evidenceStatus: true, photoSubject: true } } },
  });
  const rules = await findActiveRulesForCaseType(c.caseType);
  return evaluateCarrierClaimsGate({
    caseType: c.caseType,
    matchedPolicyNames: rules.flatMap((r) => (r.linkedPolicyDocument ? [r.linkedPolicyDocument.name] : [])),
    attachments: c.attachments,
  });
}

/**
 * Shared by case intake and regenerate: LLM proposal -> deterministic evidence gate ->
 * persist proposal + pending HumanApproval + audit, and the guarded new -> awaiting_approval
 * auto-advance. Throws if the LLM call fails (callers decide how to degrade).
 * `actorLabel` is only used for the audit trail; authorization is the caller's job.
 */
export async function generateResolutionProposal(actorLabel: string, caseId: string, deps: ProposalDeps = defaultDeps) {
  const c = await db.customerCase.findUniqueOrThrow({
    where: { id: caseId },
    include: { order: true, shipment: true, attachments: true },
  });
  const rules = await findActiveRulesForCaseType(c.caseType);

  const generated = await deps.generate({
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
    rules: rules.map((r) => ({
      ruleName: r.ruleName,
      requiredEvidence: r.requiredEvidence,
      recommendedResolution: r.recommendedResolution,
      escalationPath: r.escalationPath,
      policyName: r.linkedPolicyDocument?.name ?? null,
      policyVersion: r.linkedPolicyDocument?.version ?? null,
      policySummary: r.linkedPolicyDocument?.summary ?? null,
    })),
  });

  const gate = evaluateCarrierClaimsGate({
    caseType: c.caseType,
    matchedPolicyNames: rules.flatMap((r) => (r.linkedPolicyDocument ? [r.linkedPolicyDocument.name] : [])),
    attachments: c.attachments,
  });
  const final = applyGateToProposal(generated, gate);

  return db.$transaction(async (tx) => {
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
      },
    });
    const approval = await tx.humanApproval.create({
      data: {
        linkedCaseId: caseId,
        approvalType: "resolution_proposal",
        linkedResolutionProposalId: proposal.id,
      },
    });
    await tx.customerCase.update({ where: { id: caseId }, data: { resolutionRecommendation: final.recommendation } });
    await logAuditEvent(
      {
        caseId,
        actor: actorLabel,
        action: "resolution_proposal_generated",
        newState: proposal.status,
        ruleSource: final.policySource,
        notes: final.evidenceGateApplied
          ? `Evidence gate overrode the recommendation (LLM proposed "${generated.recommendation}"); missing: ${gate.missing.join(", ")}`
          : null,
      },
      tx,
    );
    // Guarded auto-advance: new -> awaiting_approval only, never touches later statuses.
    const advanced = await tx.customerCase.updateMany({
      where: { id: caseId, status: "new" },
      data: { status: "awaiting_approval" },
    });
    if (advanced.count > 0) {
      await logAuditEvent(
        { caseId, actor: "system", action: "status_changed", previousState: "new", newState: "awaiting_approval" },
        tx,
      );
    }
    return { proposal, approval, gate };
  });
}
