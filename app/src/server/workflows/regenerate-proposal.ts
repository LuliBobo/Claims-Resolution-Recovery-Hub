import { ANY_ROLE, requireRole, type Actor } from "@/server/auth";
import { generateResolutionProposal, type ProposalDeps } from "./proposal-generation";

/**
 * Generates a fresh proposal for a case. M4 version: creates the proposal + approval only.
 * M6 wraps this in a row-locked transaction with current-proposal pointer and supersession.
 */
export async function regenerateResolutionProposal(actor: Actor | null, caseId: string, deps?: ProposalDeps) {
  const user = requireRole(actor, ...ANY_ROLE);
  return generateResolutionProposal(user.email, caseId, deps);
}
