import type { AttachmentCategory, CaseType, EvidenceStatus, PhotoSubject } from "@/generated/prisma/client";

// Pure, zero-LLM-dependency deterministic gate. Called from proposal generation (intake and
// regenerate) and again before a recovery draft can be marked sent. Never duplicate this
// logic elsewhere, and never cache its result: callers pass CURRENT attachments every time,
// so adding or removing evidence flips the outcome immediately.

// The gate applies only when the matched policy has exactly this name. Renaming the policy
// document silently disables the gate.
export const CARRIER_CLAIMS_SOP_NAME = "DPD Carrier Claims SOP";
export const MISSING_EVIDENCE_RECOMMENDATION = "Request Missing Evidence";

export interface GateAttachment {
  attachmentCategory: AttachmentCategory;
  evidenceStatus: EvidenceStatus;
  photoSubject: PhotoSubject | null;
}

export interface GateInput {
  caseType: CaseType;
  /** Names of the policy documents matched to the case by the active rules. */
  matchedPolicyNames: readonly string[];
  attachments: readonly GateAttachment[];
}

export interface EvidenceChecklist {
  shippingLabelPhoto: boolean;
  damagedItemPhoto: boolean;
  outerCartonPhoto: boolean;
}

export interface GateResult {
  applies: boolean;
  checklist: EvidenceChecklist;
  /** True when all three items are present. Meaningful only if `applies`. */
  evidenceComplete: boolean;
  missing: string[];
}

/** "Present" means evidenceStatus === "sufficient". The single definition, used everywhere. */
const sufficient = (a: GateAttachment) => a.evidenceStatus === "sufficient";

export function computeChecklist(attachments: readonly GateAttachment[]): EvidenceChecklist {
  return {
    shippingLabelPhoto: attachments.some((a) => sufficient(a) && a.attachmentCategory === "shipping_label"),
    damagedItemPhoto: attachments.some(
      (a) => sufficient(a) && a.attachmentCategory === "photo_evidence" && a.photoSubject === "item",
    ),
    outerCartonPhoto: attachments.some(
      (a) => sufficient(a) && a.attachmentCategory === "photo_evidence" && a.photoSubject === "outer_carton",
    ),
  };
}

export function evaluateCarrierClaimsGate(input: GateInput): GateResult {
  const checklist = computeChecklist(input.attachments);
  const applies =
    input.caseType === "damaged_delivery" && input.matchedPolicyNames.includes(CARRIER_CLAIMS_SOP_NAME);
  const missing = [
    !checklist.shippingLabelPhoto && "shipping label photo",
    !checklist.damagedItemPhoto && "damaged item photo",
    !checklist.outerCartonPhoto && "outer carton photo",
  ].filter((x): x is string => Boolean(x));
  return { applies, checklist, evidenceComplete: missing.length === 0, missing };
}

/**
 * Applies the gate to an LLM proposal. Overwrites ONLY `recommendation`; rationale,
 * confidence and customer impact stay as the LLM wrote them so the override is auditable.
 */
export function applyGateToProposal<T extends { recommendation: string; needsHumanApproval: boolean }>(
  proposal: T,
  gate: GateResult,
): T & { evidenceGateApplied: boolean } {
  if (gate.applies && !gate.evidenceComplete) {
    return {
      ...proposal,
      recommendation: MISSING_EVIDENCE_RECOMMENDATION,
      needsHumanApproval: true,
      evidenceGateApplied: true,
    };
  }
  return { ...proposal, evidenceGateApplied: false };
}
