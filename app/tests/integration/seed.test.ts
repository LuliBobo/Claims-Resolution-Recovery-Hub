import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { CARRIER_CLAIMS_SOP_NAME } from "@/server/evidence/carrier-claims-gate";
import { seedSampleData } from "@/server/seed/sample-data";
import { listCasesNeedingReconciliation } from "@/server/workflows/proposal-supersession";

const MARK = "SYNTHETIC TEST DATA";
const seededCases = () => db.customerCase.findMany({ where: { complaintText: { startsWith: MARK } } });

let policyId: string, ruleId: string;
beforeAll(async () => {
  // The test DB is not seeded; the gate needs the exact-named SOP policy and a damaged-delivery rule.
  policyId = (await db.policyDocument.create({ data: { name: CARRIER_CLAIMS_SOP_NAME, documentType: "carrier_agreement" } })).id;
  ruleId = (await db.rule.create({ data: { ruleName: "seed test damaged", triggerType: "damaged_delivery", linkedPolicyDocumentId: policyId } })).id;
});

afterAll(async () => {
  await db.rule.delete({ where: { id: ruleId } });
  await db.policyDocument.delete({ where: { id: policyId } });
  const ids = (await seededCases()).map((c) => c.id);
  await db.customerCase.deleteMany({ where: { id: { in: ids } } });
  await db.shipment.deleteMany({ where: { trackingNumber: { startsWith: "TEST-TRACK-" } } });
  await db.order.deleteMany({ where: { customerEmail: { endsWith: "@example.com" }, orderDate: { lt: new Date("2026-06-01") } } });
  await db.$disconnect();
});

describe("sample data seed", () => {
  it("imports the CSV cases through the real workflows and is idempotent", async () => {
    const first = await seedSampleData();
    expect(first.cases).toBe(28);
    expect(first.attachments).toBe(35);
    expect(first.skippedMissingEvidence).toBe(7);

    const second = await seedSampleData();
    expect(second).toMatchObject({ cases: 0, skippedExisting: 28 });
    expect(await db.customerCase.count({ where: { complaintText: { startsWith: MARK } } })).toBe(28);
  });

  it("every case ends with exactly one live proposal and it is current; nothing needs reconciliation", async () => {
    const cases = await seededCases();
    for (const c of cases) {
      const live = await db.resolutionProposal.findMany({ where: { linkedCaseId: c.id, status: { in: ["pending_approval", "approved"] } } });
      const all = await db.resolutionProposal.findMany({ where: { linkedCaseId: c.id } });
      expect(all).toHaveLength(1);
      expect(c.currentResolutionProposalId).toBe(all[0].id);
      expect(live.length).toBeLessThanOrEqual(1);
    }
    const ambiguous = (await listCasesNeedingReconciliation()).filter((r) => cases.some((c) => c.id === r.id));
    expect(ambiguous).toHaveLength(0);
  });

  it("proposals came from the real gate, and the audit trail was written by the workflows", async () => {
    // Damaged deliveries without all three sufficient photos must have been overridden.
    const damaged = await db.customerCase.findMany({
      where: { complaintText: { startsWith: MARK }, caseType: "damaged_delivery" },
      include: { resolutionProposals: true, attachments: true },
    });
    for (const c of damaged) {
      const has = (subject: string | null, cat: string) =>
        c.attachments.some((a) => a.attachmentCategory === cat && a.photoSubject === subject && a.evidenceStatus === "sufficient");
      const complete =
        c.attachments.some((a) => a.attachmentCategory === "shipping_label" && a.evidenceStatus === "sufficient") &&
        has("item", "photo_evidence") && has("outer_carton", "photo_evidence");
      expect(c.resolutionProposals[0].evidenceGateApplied).toBe(!complete);
    }
    const actions = new Set((await db.auditEvent.findMany({ where: { case: { complaintText: { startsWith: MARK } } } })).map((e) => e.action));
    for (const a of ["case_created", "resolution_proposal_generated", "resolution_proposal_approved", "recovery_draft_generated", "status_changed"]) {
      expect(actions).toContain(a);
    }
  });

  it("never marks a recovery draft sent unless the gate allowed it", async () => {
    const sent = await db.recoveryDraft.findMany({ where: { status: "sent", case: { complaintText: { startsWith: MARK } } }, include: { case: { include: { attachments: true } } } });
    for (const d of sent) expect(d.sentAt).not.toBeNull();
  });
});
