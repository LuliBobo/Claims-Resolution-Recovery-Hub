import { ANY_ROLE, requireRole, type Actor } from "@/server/auth";
import { generateResolutionProposal, type ProposalDeps } from "./proposal-generation";

/**
 * Generates a fresh proposal. The new proposal becomes current; the previously-current one is
 * superseded (if still live). All of that happens atomically in generateResolutionProposal.
 */
export async function regenerateResolutionProposal(actor: Actor | null, caseId: string, deps?: ProposalDeps) {
  const user = requireRole(actor, ...ANY_ROLE);
  return generateResolutionProposal(user.email, caseId, deps);
}
