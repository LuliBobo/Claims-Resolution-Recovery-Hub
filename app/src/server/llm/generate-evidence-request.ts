import { z } from "zod";
import { callClaudeJson } from "./client";
import { EVIDENCE_REQUEST_SYSTEM } from "./prompts/evidence-request";

const schema = z.object({
  message: z.string().min(1).describe("The complete email body, in the customer's language"),
});

export interface EvidenceRequestContext {
  customerName: string;
  customerLanguage: string;
  orderReference: string | null;
  productName: string | null;
  /** The exact items to request. */
  itemsToRequest: string[];
}

export function generateEvidenceRequestText(ctx: EvidenceRequestContext): Promise<{ message: string }> {
  return callClaudeJson({
    name: "record_evidence_request",
    description: "Record the customer-facing email asking for the listed evidence.",
    system: EVIDENCE_REQUEST_SYSTEM,
    user: `<case>\n${JSON.stringify(ctx, null, 2)}\n</case>`,
    schema,
    maxTokens: 1024,
  });
}
