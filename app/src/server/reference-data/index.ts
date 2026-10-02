import { ANY_ROLE, REVIEW_ROLES, requireRole, type Actor } from "@/server/auth";
import { db } from "@/server/db";
import type { RuleTriggerType } from "@/generated/prisma/client";
import {
  orderInput,
  policyDocumentInput,
  ruleInput,
  shipmentInput,
} from "@/lib/validation/reference-data";

// Orders / Shipments: any signed-in role. Policies / Rules drive proposal generation,
// so editing them is limited to reviewer/admin (the plan is silent; conservative default).

export const listOrders = () => db.order.findMany({ orderBy: { orderDate: "desc" } });
export const listShipments = () =>
  db.shipment.findMany({ orderBy: { createdAt: "desc" }, include: { order: true } });
export const listPolicyDocuments = () =>
  db.policyDocument.findMany({
    orderBy: { name: "asc" },
    // Never select the PDF bytes for a listing.
    include: { file: { select: { fileName: true, pageCount: true, emptyPages: true, passageCount: true, uploadedBy: true, uploadedAt: true } } },
  });
export const listRules = () =>
  db.rule.findMany({ orderBy: { ruleName: "asc" }, include: { linkedPolicyDocument: true } });

export async function createOrder(actor: Actor | null, raw: unknown) {
  requireRole(actor, ...ANY_ROLE);
  return db.order.create({ data: orderInput.parse(raw) });
}
export async function updateOrder(actor: Actor | null, id: string, raw: unknown) {
  requireRole(actor, ...ANY_ROLE);
  return db.order.update({ where: { id }, data: orderInput.parse(raw) });
}

export async function createShipment(actor: Actor | null, raw: unknown) {
  requireRole(actor, ...ANY_ROLE);
  return db.shipment.create({ data: shipmentInput.parse(raw) });
}
export async function updateShipment(actor: Actor | null, id: string, raw: unknown) {
  requireRole(actor, ...ANY_ROLE);
  return db.shipment.update({ where: { id }, data: shipmentInput.parse(raw) });
}

export async function createPolicyDocument(actor: Actor | null, raw: unknown) {
  requireRole(actor, ...REVIEW_ROLES);
  return db.policyDocument.create({ data: policyDocumentInput.parse(raw) });
}
export async function updatePolicyDocument(actor: Actor | null, id: string, raw: unknown) {
  requireRole(actor, ...REVIEW_ROLES);
  return db.policyDocument.update({ where: { id }, data: policyDocumentInput.parse(raw) });
}
export async function setPolicyDocumentActive(actor: Actor | null, id: string, active: boolean) {
  requireRole(actor, ...REVIEW_ROLES);
  return db.policyDocument.update({ where: { id }, data: { activeStatus: active } });
}

export async function createRule(actor: Actor | null, raw: unknown) {
  requireRole(actor, ...REVIEW_ROLES);
  return db.rule.create({ data: ruleInput.parse(raw) });
}
export async function updateRule(actor: Actor | null, id: string, raw: unknown) {
  requireRole(actor, ...REVIEW_ROLES);
  return db.rule.update({ where: { id }, data: ruleInput.parse(raw) });
}
export async function setRuleActive(actor: Actor | null, id: string, active: boolean) {
  requireRole(actor, ...REVIEW_ROLES);
  return db.rule.update({ where: { id }, data: { activeStatus: active } });
}

/**
 * Active rules matching a case type, with their linked active policy documents.
 * Matching is by value equality on triggerType (application-level, not an FK).
 * Used by proposal generation (M4).
 */
export async function findActiveRulesForCaseType(caseType: RuleTriggerType, client: Pick<typeof db, "rule"> = db) {
  return client.rule.findMany({
    where: {
      activeStatus: true,
      triggerType: caseType,
      OR: [{ linkedPolicyDocumentId: null }, { linkedPolicyDocument: { activeStatus: true } }],
    },
    include: { linkedPolicyDocument: true },
  });
}
