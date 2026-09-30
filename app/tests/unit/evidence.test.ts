import { describe, expect, it } from "vitest";
import {
  applyGateToProposal,
  CARRIER_CLAIMS_SOP_NAME,
  evaluateCarrierClaimsGate,
  MISSING_EVIDENCE_RECOMMENDATION,
  type GateAttachment,
} from "@/server/evidence/carrier-claims-gate";
import { assessObservation } from "@/server/evidence/assess";
import { judgeDocumentSufficiency } from "@/server/evidence/sufficiency-document";
import { judgePhotoSufficiency } from "@/server/evidence/sufficiency-photo";
import { judgeShippingLabelSufficiency } from "@/server/evidence/sufficiency-shipping-label";
import { CARRIER_CLAIMS_SOP_NAME as SEED_SOP_NAME } from "@/server/reference-data/seed-data";

const att = (
  attachmentCategory: GateAttachment["attachmentCategory"],
  photoSubject: GateAttachment["photoSubject"] = null,
  evidenceStatus: GateAttachment["evidenceStatus"] = "sufficient",
): GateAttachment => ({ attachmentCategory, photoSubject, evidenceStatus });

const full = [att("shipping_label"), att("photo_evidence", "item"), att("photo_evidence", "outer_carton")];
const base = { caseType: "damaged_delivery" as const, matchedPolicyNames: [CARRIER_CLAIMS_SOP_NAME] };

describe("sufficiency modules", () => {
  it("photo: needs legibility and visible damage or condition", () => {
    expect(judgePhotoSufficiency({ legible: true, showsDamageOrCondition: true, subject: "item" }).status).toBe("sufficient");
    expect(judgePhotoSufficiency({ legible: true, showsDamageOrCondition: false, subject: "item" }).status).toBe("insufficient");
    expect(judgePhotoSufficiency({ legible: false, showsDamageOrCondition: true, subject: "item" }).status).toBe("insufficient");
  });
  it("shipping label: judged on shipment info, never on damage", () => {
    const ok = { legible: true, hasTrackingNumber: true, hasCarrier: true, hasAddress: true, hasShipDate: true };
    expect(judgeShippingLabelSufficiency(ok).status).toBe("sufficient");
    const r = judgeShippingLabelSufficiency({ ...ok, hasShipDate: false, hasAddress: false });
    expect(r.status).toBe("insufficient");
    expect(r.reason).toContain("address");
    expect(r.reason).toContain("ship date");
  });
  it("document: legibility and relevance", () => {
    expect(judgeDocumentSufficiency({ legible: true, relevantToCase: true }).status).toBe("sufficient");
    expect(judgeDocumentSufficiency({ legible: true, relevantToCase: false }).status).toBe("insufficient");
  });
  it("assessObservation routes by kind and carries the photo subject", () => {
    const a = assessObservation({ kind: "photo", notes: "n", observation: { legible: true, showsDamageOrCondition: true, subject: "outer_carton" } });
    expect(a).toMatchObject({ status: "sufficient", photoSubject: "outer_carton", notes: "n" });
    expect(assessObservation({ kind: "document", notes: "", observation: { legible: true, relevantToCase: true } }).photoSubject).toBeNull();
  });
});

describe("carrier claims gate", () => {
  it("applies only to damaged_delivery with the exactly named SOP", () => {
    expect(evaluateCarrierClaimsGate({ ...base, attachments: [] }).applies).toBe(true);
    expect(evaluateCarrierClaimsGate({ ...base, caseType: "wrong_item", attachments: [] }).applies).toBe(false);
    expect(evaluateCarrierClaimsGate({ ...base, matchedPolicyNames: ["dpd carrier claims sop"], attachments: [] }).applies).toBe(false);
  });
  it("is incomplete with no evidence and lists everything missing", () => {
    const g = evaluateCarrierClaimsGate({ ...base, attachments: [] });
    expect(g.evidenceComplete).toBe(false);
    expect(g.missing).toEqual(["shipping label photo", "damaged item photo", "outer carton photo"]);
  });
  it("is complete only with all three sufficient", () => {
    expect(evaluateCarrierClaimsGate({ ...base, attachments: full }).evidenceComplete).toBe(true);
    expect(evaluateCarrierClaimsGate({ ...base, attachments: full.slice(0, 2) }).missing).toEqual(["outer carton photo"]);
  });
  it("present means sufficient: pending_review and insufficient do not count", () => {
    for (const status of ["pending_review", "insufficient", "not_applicable"] as const) {
      const attachments = [att("shipping_label", null, status), ...full.slice(1)];
      expect(evaluateCarrierClaimsGate({ ...base, attachments }).checklist.shippingLabelPhoto).toBe(false);
    }
  });
  it("two item photos do not stand in for a carton photo", () => {
    const attachments = [att("shipping_label"), att("photo_evidence", "item"), att("photo_evidence", "item")];
    expect(evaluateCarrierClaimsGate({ ...base, attachments }).checklist.outerCartonPhoto).toBe(false);
  });
  it("recomputes from current attachments: removing evidence flips it back", () => {
    expect(evaluateCarrierClaimsGate({ ...base, attachments: full }).evidenceComplete).toBe(true);
    expect(evaluateCarrierClaimsGate({ ...base, attachments: full.slice(1) }).evidenceComplete).toBe(false);
  });
});

describe("applyGateToProposal", () => {
  const p = { recommendation: "Full refund", rationale: "r", confidence: 0.8, needsHumanApproval: false };
  it("overwrites only the recommendation when evidence is incomplete", () => {
    const out = applyGateToProposal(p, evaluateCarrierClaimsGate({ ...base, attachments: [] }));
    expect(out).toMatchObject({ recommendation: MISSING_EVIDENCE_RECOMMENDATION, evidenceGateApplied: true, needsHumanApproval: true, rationale: "r", confidence: 0.8 });
  });
  it("leaves the proposal alone when evidence is complete or the gate does not apply", () => {
    expect(applyGateToProposal(p, evaluateCarrierClaimsGate({ ...base, attachments: full }))).toMatchObject({ recommendation: "Full refund", evidenceGateApplied: false });
    expect(applyGateToProposal(p, evaluateCarrierClaimsGate({ ...base, caseType: "other", attachments: [] })).evidenceGateApplied).toBe(false);
  });
});

it("seed data and gate use the same SOP name", () => {
  expect(SEED_SOP_NAME).toBe(CARRIER_CLAIMS_SOP_NAME);
});
