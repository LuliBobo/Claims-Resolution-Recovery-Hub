// Hardcoded seed policies/rules (no CSV exists for these). Counts match Luo's verified
// live counts: 3 PolicyDocuments, 3 Rules. Plain types so prisma/seed.ts can import this
// file without the "@/..." alias.

// The evidence gate matches this exact name string (carrier-claims-gate, M4).
// Renaming this document silently disables the gate.
export const CARRIER_CLAIMS_SOP_NAME = "DPD Carrier Claims SOP";

export const SEED_POLICIES = [
  {
    name: "Customer Returns & Refunds Policy",
    documentType: "policy",
    version: "1.0",
    jurisdiction: "EU",
    summary: "Return window, refund and replacement conditions for consumer orders.",
    activeStatus: true,
  },
  {
    name: CARRIER_CLAIMS_SOP_NAME,
    documentType: "carrier_agreement",
    version: "1.0",
    jurisdiction: "EU",
    summary:
      "Carrier damage claims require a shipping label photo, a damaged item photo and an outer carton photo.",
    activeStatus: true,
  },
  {
    name: "Supplier Quality Agreement",
    documentType: "supplier_agreement",
    version: "1.0",
    jurisdiction: "EU",
    summary: "Supplier liability for wrong or defective items.",
    activeStatus: true,
  },
] as const;

// policyName links a rule to its policy document at seed time.
export const SEED_RULES = [
  {
    ruleName: "Damaged delivery: carrier claim",
    triggerType: "damaged_delivery",
    requiredEvidence: "Shipping label photo, damaged item photo, outer carton photo",
    recommendedResolution: "Replace or refund, then file carrier claim",
    escalationPath: "Reviewer, then carrier account manager",
    policyName: CARRIER_CLAIMS_SOP_NAME,
    activeStatus: true,
  },
  {
    ruleName: "Wrong item: supplier claim",
    triggerType: "wrong_item",
    requiredEvidence: "Photo of received item and packing slip",
    recommendedResolution: "Ship correct item; claim from supplier",
    escalationPath: "Reviewer",
    policyName: "Supplier Quality Agreement",
    activeStatus: true,
  },
  {
    ruleName: "Return request: standard window",
    triggerType: "return_request",
    requiredEvidence: "Order reference",
    recommendedResolution: "Approve return within window; refund on receipt",
    escalationPath: "Reviewer",
    policyName: "Customer Returns & Refunds Policy",
    activeStatus: true,
  },
] as const;
