import { ANY_ROLE, requireRole, type Actor } from "@/server/auth";
import { db } from "@/server/db";
import { logAuditEvent } from "@/server/audit";
import { classifyComplaint, type ClassifyResult } from "@/server/llm/classify";
import { summarizeComplaint, type TranslateResult } from "@/server/llm/translate";
import { caseCreateInput } from "@/lib/validation/case";
import { generateResolutionProposal, type ProposalDeps } from "./proposal-generation";
import { generateRecoveryDraft, type RecoveryDeps } from "./recovery-draft";

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
  recoveryDeps?: RecoveryDeps,
) {
  const user = requireRole(actor, ...ANY_ROLE);
  const input = caseCreateInput.parse(raw);
  const failures: string[] = [];

  let internalEnglishSummary: string | undefined;
  let detectedLanguage: string | undefined;
  let caseType = input.caseType;
  let priority = input.priority;
  let classificationConfidence: number | undefined;
  // The two LLM calls are independent, so they run concurrently: sequentially, retries could push
  // intake past the serverless time limit.
  await Promise.all([
    llm.summarize(input.complaintText).then(
      (r) => {
        internalEnglishSummary = r.internalEnglishSummary;
        detectedLanguage = r.customerLanguage.toLowerCase();
      },
      (e) => {
        failures.push(`summary/translation failed: ${describe(e)}`);
      },
    ),
    !caseType || !priority
      ? llm.classify(input.complaintText).then(
          (r) => {
            // Confidence describes the classifier's caseType, so store it only if it produced that value.
            if (!caseType) classificationConfidence = r.confidence;
            caseType ??= r.caseType;
            priority ??= r.priority;
          },
          (e) => {
            failures.push(`classification failed: ${describe(e)}`);
          },
        )
      : Promise.resolve(),
  ]);

  // The case is flagged until every step has finished, so a function killed mid-way (time limit,
  // crash) leaves it visibly needing triage rather than silently incomplete.
  let stepFailed = failures.length > 0;

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
        needsManualTriage: true,
        recoveryNeeded: input.recoveryNeeded,
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
    stepFailed = true;
    await logAuditEvent({
      caseId: created.id,
      actor: "system",
      action: "llm_step_failed",
      notes: `proposal generation failed: ${describe(e)}`,
    });
  }
  if (input.recoveryNeeded) {
    try {
      await generateRecoveryDraft(user.email, created.id, recoveryDeps);
    } catch (e) {
      stepFailed = true;
      await logAuditEvent({
        caseId: created.id,
        actor: "system",
        action: "llm_step_failed",
        notes: `recovery draft generation failed: ${describe(e)}`,
      });
    }
  }
  if (!stepFailed) await db.customerCase.update({ where: { id: created.id }, data: { needsManualTriage: false } });
  return db.customerCase.findUniqueOrThrow({ where: { id: created.id } });
}
