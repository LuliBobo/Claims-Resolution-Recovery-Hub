import { z } from "zod";
import { callClaudeJson } from "./client";
import { RECOVERY_SYSTEM } from "./prompts/recovery";

const schema = z.object({
  claimType: z.string().describe("e.g. Transit damage, Wrong item shipped, Lost in transit"),
  draftText: z.string(),
  estimatedRecoverableValue: z
    .number()
    .nonnegative()
    .nullable()
    .describe("Amount in the order currency, or null if it cannot be determined from the data"),
});

export type GeneratedRecoveryDraft = z.infer<typeof schema>;

export interface RecoveryContext {
  counterpartyType: "carrier" | "supplier";
  counterpartyName: string;
  caseType: string;
  internalEnglishSummary: string | null;
  complaintText: string;
  order: { productName: string; sku: string; quantity: number; orderValue: string } | null;
  shipment: { carrier: string; trackingNumber: string; shipDate: string | null; deliveryStatus: string } | null;
  availableEvidence: { category: string; subject: string | null; notes: string | null }[];
}

export function generateRecoveryDraftText(ctx: RecoveryContext): Promise<GeneratedRecoveryDraft> {
  return callClaudeJson({
    name: "record_recovery_draft",
    description: "Record the recovery claim draft.",
    system: RECOVERY_SYSTEM,
    user: `<case>\n${JSON.stringify(ctx, null, 2)}\n</case>`,
    schema,
    maxTokens: 2048,
  });
}
