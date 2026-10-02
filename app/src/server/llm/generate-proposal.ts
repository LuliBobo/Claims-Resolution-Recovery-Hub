import { z } from "zod";
import { callClaudeJson } from "./client";
import type { PolicyExcerpt } from "@/server/policy/citations";
import { PROPOSAL_SYSTEM } from "./prompts/proposal";

const schema = z.object({
  recommendation: z.string().describe("Short action, e.g. Replace item, Full refund, Partial credit, Escalate, Reject"),
  rationale: z.string(),
  confidence: z.number().min(0).max(1),
  customerImpact: z.string(),
  businessExposure: z.string(),
  policySource: z.string().describe("Name and version of the rule or policy relied on, or 'none'"),
  needsHumanApproval: z.boolean(),
  customerReplyDraft: z.string().describe("Customer-facing reply written in the customer's language"),
  citedExcerptIds: z
    .array(z.string())
    .optional()
    .describe("Ids of the provided policy excerpts that directly support the recommendation. Only ids from policyExcerpts; empty if none apply. Never quote or paraphrase excerpts here."),
});

export type GeneratedProposal = z.infer<typeof schema>;

export interface ProposalContext {
  /** Verbatim policy passages retrieved for this case; the only things the AI may cite. */
  policyExcerpts: PolicyExcerpt[];
  caseType: string;
  priority: string;
  customerLanguage: string;
  complaintText: string;
  internalEnglishSummary: string | null;
  order: { productName: string; sku: string; quantity: number; orderValue: string } | null;
  shipment: { carrier: string; deliveryStatus: string } | null;
  rules: {
    ruleName: string;
    requiredEvidence: string | null;
    recommendedResolution: string | null;
    escalationPath: string | null;
    policyName: string | null;
    policyVersion: string | null;
    policySummary: string | null;
  }[];
}

/**
 * Returns the LLM's own recommendation. This module knows nothing about the evidence gate:
 * the deterministic override is applied afterwards by evidence/carrier-claims-gate.ts.
 */
export function generateProposal(ctx: ProposalContext): Promise<GeneratedProposal> {
  return callClaudeJson({
    name: "record_resolution_proposal",
    description: "Record the resolution proposal and the customer reply draft.",
    system: PROPOSAL_SYSTEM,
    user: `<case>\n${JSON.stringify(ctx, null, 2)}\n</case>`,
    schema,
    maxTokens: 2048,
  });
}
