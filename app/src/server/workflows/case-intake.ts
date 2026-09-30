import { ANY_ROLE, requireRole, type Actor } from "@/server/auth";
import { db } from "@/server/db";
import { logAuditEvent } from "@/server/audit";
import { classifyComplaint, type ClassifyResult } from "@/server/llm/classify";
import { summarizeComplaint, type TranslateResult } from "@/server/llm/translate";
import { caseCreateInput } from "@/lib/validation/case";
import { generateResolutionProposal, type ProposalDeps } from "./proposal-generation";

// Injectable so tests can run intake without the network.
export interface IntakeLlm {
  summarize: (text: string) => Promise<TranslateResult>;
  classify: (text: string) => Promise<ClassifyResult>;
}
const defaultLlm: IntakeLlm = { summarize: summarizeComplaint, classify: classifyComplaint };

const describe = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Creates a case. LLM steps (summary/translation, classification) run first and degrade
 * gracefully: if one fails the case is still created, flagged `needsManualTriage`, and the
 * failure is written to the audit trail. Everything is persisted in one transaction.
 */
export async function createCase(
  actor: Actor | null,
  raw: unknown,
  llm: IntakeLlm = defaultLlm,
  proposalDeps?: ProposalDeps,
) {
  const user = requireRole(actor, ...ANY_ROLE);
  const input = caseCreateInput.parse(raw);
  const failures: string[] = [];

  let internalEnglishSummary: string | undefined;
  let detectedLanguage: string | undefined;
  try {
    const r = await llm.summarize(input.complaintText);
    internalEnglishSummary = r.internalEnglishSummary;
    detectedLanguage = r.customerLanguage.toLowerCase();
  } catch (e) {
    failures.push(`summary/translation failed: ${describe(e)}`);
  }

  let caseType = input.caseType;
  let priority = input.priority;
  let classificationConfidence: number | undefined;
  if (!caseType || !priority) {
    try {
      const r = await llm.classify(input.complaintText);
      // Confidence describes the classifier's caseType, so store it only if it produced that value.
      if (!caseType) classificationConfidence = r.confidence;
      caseType ??= r.caseType;
      priority ??= r.priority;
    } catch (e) {
      failures.push(`classification failed: ${describe(e)}`);
    }
  }

  const needsManualTriage = failures.length > 0;

  const created = await db.$transaction(async (tx) => {
    const created = await tx.customerCase.create({
      data: {
        source: input.source,
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        customerPhone: input.customerPhone,
        customerLanguage: input.customerLanguage ?? detectedLanguage ?? "en",
        orderReference: input.orderReference,
        complaintText: input.complaintText,
        internalEnglishSummary,
        caseType: caseType ?? "other",
        priority: priority ?? "medium",
        linkedOrderId: input.linkedOrderId,
        linkedShipmentId: input.linkedShipmentId,
        needsManualTriage,
        classificationConfidence,
      },
    });
    await logAuditEvent(
      { caseId: created.id, actor: user.email, action: "case_created", newState: created.status },
      tx,
    );
    for (const f of failures) {
      await logAuditEvent(
        { caseId: created.id, actor: "system", action: "llm_step_failed", notes: f },
        tx,
      );
    }
    return created;
  });

  // Proposal step runs after the case exists so a failure here never loses the case.
  try {
    await generateResolutionProposal(user.email, created.id, proposalDeps);
  } catch (e) {
    await db.customerCase.update({ where: { id: created.id }, data: { needsManualTriage: true } });
    await logAuditEvent({
      caseId: created.id,
      actor: "system",
      action: "llm_step_failed",
      notes: `proposal generation failed: ${describe(e)}`,
    });
  }
  return db.customerCase.findUniqueOrThrow({ where: { id: created.id } });
}
