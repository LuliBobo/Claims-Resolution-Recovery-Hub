import { db } from "@/server/db";
import { findActiveRulesForCaseType } from "@/server/reference-data";
import { CARRIER_CLAIMS_SOP_NAME } from "./carrier-claims-gate";

/**
 * Whether the carrier evidence gate can currently apply to damaged-delivery cases. It depends on
 * reference data an operator can edit (policy name, active flags, rule links), so a mistake there
 * silently disables the gate. This makes that visible; it never changes gate behaviour.
 */
export async function getCarrierGateConfig(client: typeof db = db): Promise<{ active: boolean; problem: string | null }> {
  const rules = await findActiveRulesForCaseType("damaged_delivery", client);
  if (rules.some((r) => r.linkedPolicyDocument?.name === CARRIER_CLAIMS_SOP_NAME)) return { active: true, problem: null };
  return {
    active: false,
    problem: `The carrier evidence gate is OFF: no active damaged_delivery rule is linked to an active policy named "${CARRIER_CLAIMS_SOP_NAME}". Damaged-delivery proposals are not checked for missing evidence until it is restored.`,
  };
}
