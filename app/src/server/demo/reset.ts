import { ADMIN_ONLY, ANY_ROLE, requireRole, type Actor } from "@/server/auth";
import { db } from "@/server/db";
import { logAuditEvent } from "@/server/audit";
import { demoBrokenItemPng, demoCartonPng, demoShippingLabelPng } from "@/lib/png-build";
import { recomputeInsights } from "@/server/jobs/recompute-insights";
import { SEED_POLICIES, SEED_RULES } from "@/server/reference-data/seed-data";
import { seedSamplePolicyPdfs } from "@/server/seed/sample-policy-pdfs";
import { generateEvidenceRequest } from "@/server/workflows/customer-message";
import { generateResolutionProposal } from "@/server/workflows/proposal-generation";
import { generateRecoveryDraft } from "@/server/workflows/recovery-draft";
import { regenerateResolutionProposal } from "@/server/workflows/regenerate-proposal";
import { uploadAttachment } from "@/server/workflows/upload-attachment";
import { DemoDisabledError, isDemoEnabled } from "./config";
import {
  labelObservation, photoObservation, VASE, VASE_REF, vaseEvidenceRequest, vaseProposal, vaseRecovery, WRONG, WRONG_REF, wrongProposal, wrongRecovery,
} from "./scenarios";
import type { TourState } from "./tour";

export class DemoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemoError";
  }
}

const PNG_TYPE = "image/png";
const DAY = 86_400_000;

/** The starter policies and rules (idempotent, by name), so the demo has policy text to cite. */
async function ensureStarterPolicies() {
  const ids = new Map<string, string>();
  for (const p of SEED_POLICIES) {
    const row = (await db.policyDocument.findFirst({ where: { name: p.name } })) ?? (await db.policyDocument.create({ data: { ...p } }));
    ids.set(p.name, row.id);
  }
  for (const { policyName, ...r } of SEED_RULES) {
    if (!(await db.rule.findFirst({ where: { ruleName: r.ruleName } }))) {
      await db.rule.create({ data: { ...r, linkedPolicyDocumentId: ids.get(policyName) } });
    }
  }
  await seedSamplePolicyPdfs(); // skips documents that already have a PDF
}

async function wipeDemoData() {
  // Optional relations default to SET NULL, so deleting a demo order would silently unlink a real case
  // that points at it. Refuse instead, before touching anything.
  const inUse = await db.customerCase.count({ where: { isDemo: false, OR: [{ order: { isDemo: true } }, { shipment: { isDemo: true } }] } });
  if (inUse > 0) {
    throw new DemoError("Demo records are referenced by a case that is not part of the demo, so the demo cannot be reset");
  }
  // One atomic batch: all demo records go or none do.
  await db.$transaction([
    db.customerCase.deleteMany({ where: { isDemo: true } }), // cascades attachments, proposals, drafts, audit
    db.shipment.deleteMany({ where: { isDemo: true } }),
    db.order.deleteMany({ where: { isDemo: true } }),
  ]);
}

async function makeScenario(actor: Actor, s: typeof VASE, ref: string, caseType: "damaged_delivery" | "wrong_item", priority: "high" | "medium", confidence: number) {
  const order = await db.order.create({
    data: { isDemo: true, orderDate: new Date(Date.now() - 6 * DAY), salesChannel: "Webshop", customerName: s.customerName, customerEmail: s.customerEmail, ...s.order },
  });
  const shipment = await db.shipment.create({
    data: {
      isDemo: true, linkedOrderId: order.id, ...s.shipment,
      shipDate: new Date(Date.now() - 5 * DAY), deliveryDate: new Date(Date.now() - 2 * DAY), deliveryStatus: "delivered",
    },
  });
  const c = await db.customerCase.create({
    data: {
      isDemo: true, source: "email", status: "new", caseType, priority, customerName: s.customerName, customerEmail: s.customerEmail,
      customerLanguage: s.language, orderReference: ref, complaintText: s.complaint, internalEnglishSummary: s.summary,
      classificationConfidence: confidence, recoveryNeeded: true, linkedOrderId: order.id, linkedShipmentId: shipment.id,
    },
  });
  await logAuditEvent({ caseId: c.id, actor: actor.email, action: "case_created", newState: "new", notes: "Demo scenario" });
  return c;
}

const upload = (actor: Actor, caseId: string, fileName: string, category: string, bytes: Uint8Array, obs: ReturnType<typeof photoObservation>) =>
  uploadAttachment(actor, { caseId, fileName, declaredContentType: PNG_TYPE, category, bytes }, { observe: async () => obs });

async function build(actor: Actor) {
  await ensureStarterPolicies();
  await wipeDemoData();

  // Flagship: Spanish complaint, two photos, carrier claim. The outer-carton photo is still missing.
  const vase = await makeScenario(actor, VASE, VASE_REF, "damaged_delivery", "high", 0.96);
  await upload(actor, vase.id, "demo_vase_broken.png", "photo_evidence", demoBrokenItemPng(), photoObservation("item", "Demo placeholder: broken vase"));
  await upload(actor, vase.id, "demo_shipping_label.png", "shipping_label", demoShippingLabelPng(), labelObservation("Demo placeholder: shipping label"));
  await generateResolutionProposal(actor.email, vase.id, { generate: vaseProposal("before") });
  await generateRecoveryDraft(actor.email, vase.id, { generate: vaseRecovery });
  await generateEvidenceRequest(actor, vase.id, { generate: vaseEvidenceRequest });

  // Second scenario: English complaint, wrong item, supplier claim.
  const wrong = await makeScenario(actor, WRONG, WRONG_REF, "wrong_item", "medium", 0.93);
  await upload(actor, wrong.id, "demo_wrong_item_photo.png", "photo_evidence", demoCartonPng(), photoObservation("item", "Demo placeholder: wrong item"));
  await generateResolutionProposal(actor.email, wrong.id, { generate: wrongProposal });
  await generateRecoveryDraft(actor.email, wrong.id, { generate: wrongRecovery });

  // Earlier damaged-vase cases make the repeated-issue pattern (same SKU, same carrier) visible in analytics.
  for (const [i, daysAgo] of [3, 8, 15].entries()) {
    const o = await db.order.create({
      data: { isDemo: true, orderDate: new Date(Date.now() - (daysAgo + 6) * DAY), salesChannel: "Webshop", customerName: `Demo Customer ${i + 1}`, ...VASE.order },
    });
    const s = await db.shipment.create({ data: { isDemo: true, linkedOrderId: o.id, ...VASE.shipment, trackingNumber: `DEMO-TRACK-H${i + 1}`, deliveryStatus: "delivered" } });
    const c = await db.customerCase.create({
      data: {
        isDemo: true, source: "email", status: "resolved", caseType: "damaged_delivery", priority: "medium", customerName: `Demo Customer ${i + 1}`,
        complaintText: "Demo history: vase arrived damaged.", createdAt: new Date(Date.now() - daysAgo * DAY), resolvedAt: new Date(Date.now() - (daysAgo - 1) * DAY),
        linkedOrderId: o.id, linkedShipmentId: s.id,
      },
    });
    await logAuditEvent({ caseId: c.id, actor: actor.email, action: "case_created", newState: "new", notes: "Demo history" });
  }
  await recomputeInsights();
  return { vaseId: vase.id, wrongId: wrong.id };
}

/**
 * Loads (or restores) the known demo scenarios. Admin only, demo mode only. Deletes only records
 * flagged isDemo, then rebuilds them through the real workflows. Resets are serialized.
 */
export async function resetDemo(actor: Actor | null) {
  if (!isDemoEnabled()) throw new DemoDisabledError();
  const admin = requireRole(actor, ...ADMIN_ONLY);
  // The outer transaction only holds the lock; the work runs on other pool connections.
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('demo-reset'))`;
      return build(admin);
    },
    { timeout: 120_000, maxWait: 120_000 },
  );
}

/**
 * Demo shortcut for step 6: attaches the customer's outer-carton photo (a placeholder image, marked
 * sufficient by a stand-in judge) and regenerates the proposal. Everything else is the real workflow,
 * so the gate clears, the old proposal is superseded and the score drops.
 */
export async function demoAddCartonPhoto(actor: Actor | null) {
  if (!isDemoEnabled()) throw new DemoDisabledError();
  const user = requireRole(actor, ...ANY_ROLE);
  const vase = await db.customerCase.findFirst({ where: { isDemo: true, orderReference: VASE_REF }, select: { id: true } });
  if (!vase) throw new DemoError("Load the demo data first");
  const has = await db.attachment.count({ where: { linkedCaseId: vase.id, photoSubject: "outer_carton", evidenceStatus: "sufficient" } });
  if (has > 0) throw new DemoError("The outer carton photo is already attached. Reset the demo to start over");
  await upload(user, vase.id, "demo_outer_carton.png", "photo_evidence", demoCartonPng(), photoObservation("outer_carton", "Demo placeholder: outer carton"));
  await regenerateResolutionProposal(user, vase.id, { generate: vaseProposal("after") });
  return { caseId: vase.id };
}

export async function getDemoState(): Promise<{ loaded: boolean; vaseId: string | null; wrongId: string | null; state: TourState }> {
  const cases = await db.customerCase.findMany({ where: { isDemo: true, orderReference: { in: [VASE_REF, WRONG_REF] } }, select: { id: true, orderReference: true } });
  const vaseId = cases.find((c) => c.orderReference === VASE_REF)?.id ?? null;
  const wrongId = cases.find((c) => c.orderReference === WRONG_REF)?.id ?? null;
  if (!vaseId) return { loaded: false, vaseId, wrongId, state: { cartonAdded: false, approvalsDecided: false } };
  const [carton, pending, decided] = await Promise.all([
    db.attachment.count({ where: { linkedCaseId: vaseId, photoSubject: "outer_carton", evidenceStatus: "sufficient" } }),
    db.humanApproval.count({ where: { linkedCaseId: vaseId, decision: "pending" } }),
    db.humanApproval.count({ where: { linkedCaseId: vaseId, decision: { in: ["approved", "rejected", "evidence_requested"] } } }),
  ]);
  return { loaded: true, vaseId, wrongId, state: { cartonAdded: carton > 0, approvalsDecided: pending === 0 && decided > 0 } };
}
