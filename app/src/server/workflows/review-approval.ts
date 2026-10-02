import { REVIEW_ROLES, requireRole, type Actor } from "@/server/auth";
import { db } from "@/server/db";
import { logAuditEvent } from "@/server/audit";
import type { Prisma } from "@/generated/prisma/client";
import type { z } from "zod";
import { diffEdits, draftEditsSchema, proposalEditsSchema, type EditDiff } from "@/lib/validation/review";
import { evaluateGateForCase } from "./proposal-generation";
import { lockCase } from "./proposal-supersession";

export class ApprovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApprovalError";
  }
}

type Decision = "approved" | "rejected" | "evidence_requested";

/**
 * Shared core of every human review action. Resolves the linked proposal or draft strictly
 * by foreign key, under the case-row lock, and only for a pending approval.
 *  - approved / rejected: moves the item to that status.
 *  - evidence_requested: a recorded human decision of its own (never a rejection); the item
 *    becomes non-live and non-sendable, and the next regeneration replaces it. A comment saying
 *    what is needed is required.
 *  - rawEdits (approve with edits): the decision stays "approved", the content is changed in the
 *    same step, and the original values are kept on the approval as { field: { from, to } }.
 */
async function applyReview(actor: Actor | null, approvalId: string, decision: Decision, comment: string | undefined, rawEdits?: unknown) {
  const user = requireRole(actor, ...REVIEW_ROLES);
  const note = comment?.trim() || null;
  if (decision === "evidence_requested" && !note) throw new ApprovalError("Say what evidence is needed (a comment is required)");

  const head = await db.humanApproval.findUniqueOrThrow({ where: { id: approvalId }, select: { linkedCaseId: true } });
  return db.$transaction(
    async (tx) => {
      // Serialize with regenerate/send/reconcile on the case row, then re-read under the lock.
      await lockCase(tx, head.linkedCaseId);
      const approval = await tx.humanApproval.findUniqueOrThrow({ where: { id: approvalId } });
      if (approval.decision === "superseded") {
        throw new ApprovalError("This approval was superseded by a newer proposal and can no longer be reviewed");
      }
      if (approval.decision !== "pending") throw new ApprovalError(`Approval is already ${approval.decision}`);

      // Work out the edits first so a bad edit changes nothing.
      let diff: EditDiff | null = null;
      let proposalData: Prisma.ResolutionProposalUpdateManyMutationInput = {};
      let draftData: Prisma.RecoveryDraftUpdateManyMutationInput = {};
      let recommendationChanged: string | null = null;
      if (rawEdits !== undefined) {
        if (approval.approvalType === "resolution_proposal" && approval.linkedResolutionProposalId) {
          const edits = parseEdits(proposalEditsSchema, rawEdits);
          const p = await tx.resolutionProposal.findUniqueOrThrow({ where: { id: approval.linkedResolutionProposalId } });
          diff = diffEdits({ recommendation: p.recommendation, rationale: p.rationale, customerReplyDraft: p.customerReplyDraft }, edits);
          if (diff.recommendation) {
            // A human edit must not defeat the deterministic evidence gate.
            const gate = await evaluateGateForCase(approval.linkedCaseId, tx);
            if (gate.applies && !gate.evidenceComplete) {
              throw new ApprovalError(`Evidence is incomplete (missing: ${gate.missing.join(", ")}), so the recommendation cannot be edited. Request more evidence instead`);
            }
            recommendationChanged = String(diff.recommendation.to);
          }
          proposalData = Object.fromEntries(Object.entries(diff).map(([k, v]) => [k, v.to])) as Prisma.ResolutionProposalUpdateManyMutationInput;
        } else if (approval.approvalType === "recovery_draft" && approval.linkedRecoveryDraftId) {
          const edits = parseEdits(draftEditsSchema, rawEdits);
          const d = await tx.recoveryDraft.findUniqueOrThrow({ where: { id: approval.linkedRecoveryDraftId } });
          diff = diffEdits(
            { claimType: d.claimType, draftText: d.draftText, estimatedRecoverableValue: d.estimatedRecoverableValue === null ? null : Number(d.estimatedRecoverableValue) },
            edits,
          );
          draftData = Object.fromEntries(Object.entries(diff).map(([k, v]) => [k, v.to])) as Prisma.RecoveryDraftUpdateManyMutationInput;
        }
        if (!diff || Object.keys(diff).length === 0) throw new ApprovalError("No changes were made; use plain Approve");
      }

      // Conditional update: two reviewers racing on one approval, only one wins.
      const claimed = await tx.humanApproval.updateMany({
        where: { id: approvalId, decision: "pending" },
        data: {
          decision,
          reviewer: user.email,
          reviewerComment: note,
          decisionTime: new Date(),
          ...(diff ? { edits: diff as unknown as Prisma.InputJsonValue } : {}),
        },
      });
      if (claimed.count === 0) throw new ApprovalError("Approval was already reviewed");

      if (approval.approvalType === "resolution_proposal" && approval.linkedResolutionProposalId) {
        const moved = await tx.resolutionProposal.updateMany({
          where: { id: approval.linkedResolutionProposalId, status: "pending_approval" },
          data: { status: decision, ...proposalData },
        });
        if (moved.count === 0) throw new ApprovalError("Proposal is no longer pending approval");
        // Keep the case's denormalized recommendation cache in step with an edited current proposal.
        if (recommendationChanged !== null) {
          await tx.customerCase.updateMany({
            where: { id: approval.linkedCaseId, currentResolutionProposalId: approval.linkedResolutionProposalId },
            data: { resolutionRecommendation: recommendationChanged },
          });
        }
      } else if (approval.approvalType === "recovery_draft" && approval.linkedRecoveryDraftId) {
        const moved = await tx.recoveryDraft.updateMany({
          where: { id: approval.linkedRecoveryDraftId, status: "pending_approval" },
          data: { status: decision, ...(decision === "approved" ? { approvedAt: new Date() } : {}), ...draftData },
        });
        if (moved.count === 0) throw new ApprovalError("Recovery draft is no longer pending approval");
      }

      const action = diff ? `${approval.approvalType}_approved_with_edits` : `${approval.approvalType}_${decision}`;
      await logAuditEvent(
        {
          caseId: approval.linkedCaseId,
          actor: user.email,
          action,
          previousState: "pending",
          newState: decision,
          notes: [note, diff ? `Edited: ${Object.keys(diff).join(", ")}` : null].filter(Boolean).join("; ") || null,
        },
        tx,
      );
      return tx.humanApproval.findUniqueOrThrow({ where: { id: approvalId } });
    },
    { timeout: 20_000, maxWait: 20_000 },
  );
}

function parseEdits<T extends z.ZodType>(schema: T, raw: unknown): z.infer<T> {
  const r = schema.safeParse(raw);
  if (!r.success) throw new ApprovalError(`Invalid edit: ${r.error.issues.map((i) => `${i.path.join(".") || "edits"} ${i.message}`).join("; ")}`);
  return r.data;
}

/** Human approve, reject, or request more evidence. */
export function reviewApproval(actor: Actor | null, approvalId: string, decision: Decision, comment?: string) {
  return applyReview(actor, approvalId, decision, comment);
}

/** Approve after editing: the original values are preserved on the approval record. */
export function approveWithEdits(actor: Actor | null, approvalId: string, edits: unknown, comment?: string) {
  return applyReview(actor, approvalId, "approved", comment, edits);
}

export function listPendingApprovals() {
  return db.humanApproval.findMany({
    where: { decision: "pending" },
    orderBy: { createdAt: "asc" },
    include: { case: true, resolutionProposal: true, recoveryDraft: true },
  });
}
