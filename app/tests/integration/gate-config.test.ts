import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { CARRIER_CLAIMS_SOP_NAME } from "@/server/evidence/carrier-claims-gate";
import { getCarrierGateConfig } from "@/server/evidence/gate-config";

let policyId = "";
let ruleId = "";
let wasActive: string[] = [];
beforeEach(async () => {
  // Isolate from seeded data: this file owns the damaged_delivery rules while it runs.
  wasActive = (await db.rule.findMany({ where: { activeStatus: true }, select: { id: true } })).map((r) => r.id);
  await db.rule.updateMany({ where: { id: { in: wasActive } }, data: { activeStatus: false } });
  policyId = (await db.policyDocument.create({ data: { name: CARRIER_CLAIMS_SOP_NAME, documentType: "policy", version: "t" } })).id;
  ruleId = (await db.rule.create({ data: { ruleName: `gate-config-${Date.now()}`, triggerType: "damaged_delivery", linkedPolicyDocumentId: policyId } })).id;
});
afterEach(async () => {
  await db.rule.deleteMany({ where: { id: ruleId } });
  await db.policyDocument.deleteMany({ where: { id: policyId } });
  await db.rule.updateMany({ where: { id: { in: wasActive } }, data: { activeStatus: true } });
});

describe("getCarrierGateConfig", () => {
  it("is active only while an active rule links to the active SOP policy", async () => {
    expect((await getCarrierGateConfig()).active).toBe(true);
    await db.policyDocument.update({ where: { id: policyId }, data: { activeStatus: false } });
    expect((await getCarrierGateConfig()).problem).toMatch(/gate is OFF/);
    await db.policyDocument.update({ where: { id: policyId }, data: { activeStatus: true, name: "Renamed SOP" } });
    expect((await getCarrierGateConfig()).active).toBe(false);
    await db.policyDocument.update({ where: { id: policyId }, data: { name: CARRIER_CLAIMS_SOP_NAME } });
    await db.rule.update({ where: { id: ruleId }, data: { activeStatus: false } });
    expect((await getCarrierGateConfig()).active).toBe(false);
  });
});
