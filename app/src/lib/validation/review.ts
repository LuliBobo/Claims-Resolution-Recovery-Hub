import { z } from "zod";

// Fields a reviewer may change while approving. Strict: anything else is rejected, so an
// edit can never touch status, confidence, policy source or the evidence-gate flag.
const text = z.string().trim().min(1, "Must not be empty");

export const proposalEditsSchema = z
  .object({ recommendation: text, rationale: text, customerReplyDraft: text })
  .partial()
  .strict();

export const draftEditsSchema = z
  .object({ claimType: text, draftText: text, estimatedRecoverableValue: z.number().finite().nonnegative() })
  .partial()
  .strict();

export type ProposalEdits = z.infer<typeof proposalEditsSchema>;
export type DraftEdits = z.infer<typeof draftEditsSchema>;
export type EditDiff = Record<string, { from: string | number | null; to: string | number }>;

/** Keeps only the fields whose new value differs from the current one, recording from -> to. */
export function diffEdits(current: Record<string, string | number | null>, edits: Record<string, string | number | undefined>): EditDiff {
  const diff: EditDiff = {};
  for (const [field, to] of Object.entries(edits)) {
    if (to === undefined) continue;
    const from = current[field] ?? null;
    if (String(from) !== String(to)) diff[field] = { from, to };
  }
  return diff;
}
