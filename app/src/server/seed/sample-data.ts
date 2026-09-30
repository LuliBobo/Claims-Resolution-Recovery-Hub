import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/server/db";
import { parseCsv } from "@/lib/csv";
import type { Actor } from "@/server/auth";
import type { AttachmentCategory, CaseStatus, CaseType, PhotoSubject } from "@/generated/prisma/client";
import { generateResolutionProposal } from "@/server/workflows/proposal-generation";
import { generateRecoveryDraft } from "@/server/workflows/recovery-draft";
import { reviewApproval } from "@/server/workflows/review-approval";
import { sendRecoveryDraft } from "@/server/workflows/send-recovery-draft";
import { updateCase } from "@/server/workflows/case-management";

// Seeds the synthetic sample dataset (Sample data/, identical to NEW Sample Data/).
//
// Package A (orders, shipments, customer_cases, attachments) is imported directly, in
// dependency order, with the explicit field mapping below. Package B (proposals, drafts,
// approvals, audit events) is NOT loaded: those CSVs are reference fixtures that predate
// fields this rebuild needs. Instead each case is driven through the REAL workflow functions
// (proposal generation with the evidence gate, approvals, recovery drafts, sending, status
// changes), with deterministic stand-ins for the LLM text so seeding needs no API key.
//
// FIELD MAPPING (Luo dataset vocabulary -> this schema)
//  orders:      order_number -> customer case orderReference (Order has no number column);
//               unit_price, notes -> dropped (order_value kept); sales_channel absent -> "Webshop"
//  shipments:   shipment_date -> shipDate; shipment_status -> deliveryStatus; notes dropped
//  cases:       source "manual" -> "other" (no manual value in the verified enum);
//               customerLanguage absent -> "en"; recoveryNeeded = the case has a recovery draft
//  attachments: damaged_item_photo -> photo_evidence + photoSubject item
//               outer_carton_photo -> photo_evidence + photoSubject outer_carton
//               shipping_label_photo -> shipping_label
//               invoice -> invoice; customer_message -> correspondence; proof_of_delivery, other -> other
//               evidence_status present -> sufficient, invalid -> insufficient, not_required -> not_applicable
//               rows with evidence_status "missing" are SKIPPED: they denote an absent file
//               storage_path -> storageRef ("synthetic://..." placeholder, no bytes exist)

export const seedActors: Record<"agent" | "reviewer" | "admin", Actor> = {
  agent: { id: "seed-agent", email: "agent@example.com", name: "Alex Agent", role: "agent" },
  reviewer: { id: "seed-reviewer", email: "reviewer@example.com", name: "Riley Reviewer", role: "reviewer" },
  admin: { id: "seed-admin", email: "admin@example.com", name: "Sam Admin", role: "admin" },
};

const CATEGORY_MAP: Record<string, { category: AttachmentCategory; subject: PhotoSubject | null }> = {
  damaged_item_photo: { category: "photo_evidence", subject: "item" },
  outer_carton_photo: { category: "photo_evidence", subject: "outer_carton" },
  shipping_label_photo: { category: "shipping_label", subject: null },
  invoice: { category: "invoice", subject: null },
  customer_message: { category: "correspondence", subject: null },
  proof_of_delivery: { category: "other", subject: null },
  other: { category: "other", subject: null },
};
const EVIDENCE_MAP = { present: "sufficient", invalid: "insufficient", not_required: "not_applicable" } as const;
const MIME_BY_EXT: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", pdf: "application/pdf", txt: "text/plain" };

type Row = Record<string, string>;
const by = (rows: Row[], key: string) => new Map(rows.map((r) => [r[key], r]));
const group = (rows: Row[], key: string) => {
  const m = new Map<string, Row[]>();
  for (const r of rows) m.set(r[key], [...(m.get(r[key]) ?? []), r]);
  return m;
};

export interface SeedReport {
  cases: number;
  skippedExisting: number;
  attachments: number;
  skippedMissingEvidence: number;
  warnings: string[];
}

export async function seedSampleData(dir = process.env.SAMPLE_DATA_DIR ?? path.resolve(process.cwd(), "../Sample data")): Promise<SeedReport> {
  const load = async (f: string) => parseCsv(await readFile(path.join(dir, f), "utf-8"));
  const [orders, shipments, cases, attachments, proposals, drafts, approvals] = await Promise.all(
    ["orders", "shipments", "customer_cases", "attachments", "resolution_proposals", "recovery_drafts", "human_approvals"].map((n) => load(`${n}.csv`)),
  );
  const report: SeedReport = { cases: 0, skippedExisting: 0, attachments: 0, skippedMissingEvidence: 0, warnings: [] };

  const orderRows = by(orders, "order_number");
  const shipmentByOrder = by(shipments, "order_number");
  const attByCase = group(attachments, "case_number");
  const proposalByCase = by(proposals, "case_number");
  const draftByCase = by(drafts, "case_number");
  const approvalByRecord = by(approvals, "related_record_number");

  for (const c of cases) {
    // Idempotent: the complaint text embeds the unique test-case number.
    if (await db.customerCase.findFirst({ where: { complaintText: c.complaint_text }, select: { id: true } })) {
      report.skippedExisting++;
      continue;
    }
    const o = orderRows.get(c.order_number);
    const s = shipmentByOrder.get(c.order_number);
    if (!o || !s) {
      report.warnings.push(`${c.case_number}: missing order or shipment, skipped`);
      continue;
    }

    // 1. Orders -> Shipments -> Cases (reuse rows across cases sharing an order).
    const order =
      (await db.order.findFirst({ where: { customerEmail: o.customer_email, sku: o.sku, orderDate: new Date(o.order_date) } })) ??
      (await db.order.create({
        data: {
          orderDate: new Date(o.order_date), salesChannel: "Webshop", customerName: o.customer_name, customerEmail: o.customer_email,
          sku: o.sku, productName: o.product_name, quantity: Number(o.quantity), orderValue: o.order_value, supplier: o.supplier,
        },
      }));
    const shipment =
      (await db.shipment.findFirst({ where: { trackingNumber: s.tracking_number } })) ??
      (await db.shipment.create({
        data: {
          linkedOrderId: order.id, carrier: s.carrier, trackingNumber: s.tracking_number, shipDate: new Date(s.shipment_date),
          deliveryDate: s.delivery_date ? new Date(s.delivery_date) : null,
          deliveryStatus: s.shipment_status as "in_transit" | "delivered" | "delayed" | "lost" | "returned",
        },
      }));

    const draftRow = draftByCase.get(c.case_number);
    const created = await db.customerCase.create({
      data: {
        createdAt: new Date(c.created_at), source: "other", status: "new", caseType: c.case_type as CaseType,
        priority: c.priority as "low", customerName: c.customer_name, customerEmail: c.customer_email, customerLanguage: "en",
        orderReference: c.order_number, complaintText: c.complaint_text, internalEnglishSummary: c.complaint_text,
        linkedOrderId: order.id, linkedShipmentId: shipment.id, recoveryNeeded: Boolean(draftRow),
      },
    });
    await db.auditEvent.create({
      data: { linkedCaseId: created.id, eventTime: new Date(c.created_at), actor: "seed", action: "case_created", newState: "new", notes: c.case_number },
    });
    report.cases++;

    // 2. Attachments (metadata only).
    for (const a of attByCase.get(c.case_number) ?? []) {
      if (a.evidence_status === "missing") {
        report.skippedMissingEvidence++;
        continue;
      }
      const map = CATEGORY_MAP[a.category];
      const status = EVIDENCE_MAP[a.evidence_status as keyof typeof EVIDENCE_MAP];
      if (!map || !status) {
        report.warnings.push(`${a.attachment_number}: unmapped category/status, skipped`);
        continue;
      }
      const ext = a.filename.split(".").pop()?.toLowerCase() ?? "";
      await db.attachment.create({
        data: {
          linkedCaseId: created.id, fileName: a.filename, declaredContentType: MIME_BY_EXT[ext] ?? "application/octet-stream",
          attachmentCategory: map.category, photoSubject: map.subject, evidenceStatus: status, aiNotes: a.notes,
          storageRef: a.storage_path, createdAt: new Date(a.uploaded_at),
        },
      });
      report.attachments++;
    }

    // 3. Proposal through the real workflow (evidence gate included).
    const p = proposalByCase.get(c.case_number);
    if (p) {
      const { approval } = await generateResolutionProposal("seed", created.id, {
        generate: async () => ({
          recommendation: p.recommendation, rationale: p.rationale, confidence: 0.7, customerImpact: "moderate", businessExposure: "manageable",
          policySource: "sample dataset", needsHumanApproval: true, customerReplyDraft: `SYNTHETIC TEST DATA — placeholder customer reply for ${c.case_number}.`,
        }),
      });
      const decision = approvalByRecord.get(p.proposal_number)?.status;
      if (decision === "approved" || decision === "rejected") {
        await reviewApproval(seedActors.reviewer, approval.id, decision, `Seeded from ${p.proposal_number}`);
      }
    }

    // 4. Recovery draft through the real workflow; send only if the real gate allows it.
    if (draftRow) {
      try {
        const { draft, approval } = await generateRecoveryDraft(
          "seed", created.id,
          { generate: async () => ({ claimType: "Sample claim", draftText: draftRow.draft_text, estimatedRecoverableValue: Number(draftRow.estimated_recoverable_value) }) },
          draftRow.counterparty_type as "carrier" | "supplier",
        );
        const decision = approvalByRecord.get(draftRow.recovery_draft_number)?.status;
        if (decision === "approved" || decision === "rejected") {
          await reviewApproval(seedActors.reviewer, approval.id, decision, `Seeded from ${draftRow.recovery_draft_number}`);
        }
        if (draftRow.status === "sent") {
          // Fixture says "sent" but was never approved in the fixture? Approve first when needed.
          if (decision !== "approved") await reviewApproval(seedActors.reviewer, approval.id, "approved", "Seeded (fixture status: sent)");
          try {
            await sendRecoveryDraft(seedActors.agent, draft.id);
          } catch (e) {
            report.warnings.push(`${c.case_number}: draft left approved, not sent (${e instanceof Error ? e.message : e})`);
          }
        }
      } catch (e) {
        report.warnings.push(`${c.case_number}: recovery draft skipped (${e instanceof Error ? e.message : e})`);
      }
    }

    // 5. Manual lifecycle statuses (resolved/escalated/closed/in_review are manual-only transitions).
    const target = c.status as CaseStatus;
    const now = (await db.customerCase.findUniqueOrThrow({ where: { id: created.id }, select: { status: true } })).status;
    if (target !== "new" && target !== "awaiting_approval" && target !== now) {
      await updateCase(seedActors.admin, created.id, { status: target });
    }
  }
  return report;
}
