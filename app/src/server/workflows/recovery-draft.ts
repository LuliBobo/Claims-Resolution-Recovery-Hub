import type { RecoveryDraftStatus } from "@/generated/prisma/client";
import { ANY_ROLE, requireRole, type Actor } from "@/server/auth";
import { db } from "@/server/db";
import { logAuditEvent } from "@/server/audit";
import { lockCase } from "@/server/workflows/proposal-supersession";
import {
  generateRecoveryDraftText,
  type GeneratedRecoveryDraft,
  type RecoveryContext,
} from "@/server/llm/generate-recovery-draft";

export interface RecoveryDeps {
  generate: (ctx: RecoveryContext) => Promise<GeneratedRecoveryDraft>;
}
const defaultDeps: RecoveryDeps = { generate: generateRecoveryDraftText };

/** Drafts that are still live: not yet rejected, sent or resolved. */
const OPEN_DRAFT_STATUSES: RecoveryDraftStatus[] = ["draft", "pending_approval", "evidence_requested", "approved"];

export class RecoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecoveryError";
  }
}

/** Damaged and missing deliveries are claimed from the carrier; everything else from the supplier. */
export function defaultCounterpartyType(caseType: string): "carrier" | "supplier" {
  return caseType === "damaged_delivery" || caseType === "missing_item" ? "carrier" : "supplier";
}

/**
 * Creates a recovery draft with its own pending HumanApproval. The counterparty follows
 * defaultCounterpartyType unless `counterpartyType` is passed explicitly.
 * `actorLabel` is for the audit trail only; authorization is the caller's job.
 */
export async function generateRecoveryDraft(
  actorLabel: string,
  caseId: string,
  deps: RecoveryDeps = defaultDeps,
  counterpartyType?: "carrier" | "supplier",
) {
  const c = await db.customerCase.findUniqueOrThrow({
    where: { id: caseId },
    include: { order: true, shipment: true, attachments: true },
  });
  const carrier = (counterpartyType ?? defaultCounterpartyType(c.caseType)) === "carrier";
  const counterpartyName = carrier ? c.shipment?.carrier : c.order?.supplier;
  if (!counterpartyName) {
    throw new RecoveryError(
      carrier ? "Link a shipment with a carrier before drafting a carrier claim" : "Link an order with a supplier before drafting a supplier claim",
    );
  }

  const generated = await deps.generate({
    counterpartyType: carrier ? "carrier" : "supplier",
    counterpartyName,
    caseType: c.caseType,
    internalEnglishSummary: c.internalEnglishSummary,
    complaintText: c.complaintText,
    order: c.order && {
      productName: c.order.productName,
      sku: c.order.sku,
      quantity: c.order.quantity,
      orderValue: c.order.orderValue.toString(),
    },
    shipment: c.shipment && {
      carrier: c.shipment.carrier,
      trackingNumber: c.shipment.trackingNumber,
      shipDate: c.shipment.shipDate?.toISOString().slice(0, 10) ?? null,
      deliveryStatus: c.shipment.deliveryStatus,
    },
    availableEvidence: c.attachments
      .filter((a) => a.evidenceStatus === "sufficient")
      .map((a) => ({ category: a.attachmentCategory, subject: a.photoSubject, notes: a.aiNotes })),
  });

  return db.$transaction(async (tx) => {
    // Serialise with other generators for this case, then refuse a second open claim: two live drafts
    // could both be approved and sent, claiming the same loss twice.
    await lockCase(tx, caseId);
    const open = await tx.recoveryDraft.count({ where: { linkedCaseId: caseId, status: { in: OPEN_DRAFT_STATUSES } } });
    if (open > 0) {
      throw new RecoveryError("This case already has an open recovery draft; review it (approve, reject or send) before generating another");
    }
    const draft = await tx.recoveryDraft.create({
      data: {
        linkedCaseId: caseId,
        counterpartyType: carrier ? "carrier" : "supplier",
        counterpartyName,
        claimType: generated.claimType,
        draftText: generated.draftText,
        estimatedRecoverableValue: generated.estimatedRecoverableValue,
        status: "pending_approval",
      },
    });
    const approval = await tx.humanApproval.create({
      data: { linkedCaseId: caseId, approvalType: "recovery_draft", linkedRecoveryDraftId: draft.id },
    });
    await logAuditEvent(
      { caseId, actor: actorLabel, action: "recovery_draft_generated", newState: draft.status, notes: `${draft.counterpartyType}: ${counterpartyName}` },
      tx,
    );
    const advanced = await tx.customerCase.updateMany({ where: { id: caseId, status: "new" }, data: { status: "awaiting_approval" } });
    if (advanced.count > 0) {
      await logAuditEvent({ caseId, actor: "system", action: "status_changed", previousState: "new", newState: "awaiting_approval" }, tx);
    }
    return { draft, approval };
  });
}

export async function regenerateRecoveryDraft(actor: Actor | null, caseId: string, deps?: RecoveryDeps) {
  const user = requireRole(actor, ...ANY_ROLE);
  return generateRecoveryDraft(user.email, caseId, deps);
}

/** Narrow data-quality tool: corrects only the estimated value, and audits the change. */
export async function correctRecoveryDraftValue(actor: Actor | null, draftId: string, value: number) {
  const user = requireRole(actor, ...ANY_ROLE);
  if (!Number.isFinite(value) || value < 0) throw new RecoveryError("Value must be a non-negative number");
  return db.$transaction(async (tx) => {
    const before = await tx.recoveryDraft.findUniqueOrThrow({ where: { id: draftId } });
    const after = await tx.recoveryDraft.update({ where: { id: draftId }, data: { estimatedRecoverableValue: value } });
    await logAuditEvent(
      {
        caseId: before.linkedCaseId,
        actor: user.email,
        action: "recovery_draft_value_corrected",
        previousState: before.estimatedRecoverableValue?.toString() ?? null,
        newState: after.estimatedRecoverableValue?.toString() ?? null,
      },
      tx,
    );
    return after;
  });
}
