import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuthError, type Actor } from "@/server/auth";
import { db } from "@/server/db";
import { CARRIER_CLAIMS_SOP_NAME } from "@/server/evidence/carrier-claims-gate";
import type { AttachmentObservation } from "@/server/evidence/assess";
import type { EvidenceRequestContext } from "@/server/llm/generate-evidence-request";
import { createCase } from "@/server/workflows/case-intake";
import {
  discardMessage, editMessageDraft, generateEvidenceRequest, getMissingEvidence, markMessageSent, MessageError, type MessageDeps,
} from "@/server/workflows/customer-message";
import { regenerateResolutionProposal } from "@/server/workflows/regenerate-proposal";
import { reviewApproval } from "@/server/workflows/review-approval";
import { uploadAttachment } from "@/server/workflows/upload-attachment";

const agent: Actor = { id: "a", email: "agent@test.io", name: "A", role: "agent" };
const reviewer: Actor = { id: "r", email: "reviewer@test.io", name: "R", role: "reviewer" };

const llm = {
  summarize: async () => ({ customerLanguage: "sk", internalEnglishSummary: "Broken vase." }),
  classify: async () => ({ caseType: "damaged_delivery" as const, priority: "medium" as const, confidence: 0.9 }),
};
const proposalDeps = {
  generate: async () => ({
    recommendation: "Replace item", rationale: "r", confidence: 0.8, customerImpact: "m", businessExposure: "m",
    policySource: CARRIER_CLAIMS_SOP_NAME, needsHumanApproval: true, customerReplyDraft: "x",
  }),
};

const calls: EvidenceRequestContext[] = [];
const deps: MessageDeps = {
  generate: async (ctx) => {
    calls.push(ctx);
    return { message: `Dobrý deň ${ctx.customerName}, prosíme o: ${ctx.itemsToRequest.length} položiek.` };
  },
};

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const photo = (subject: "item" | "outer_carton"): AttachmentObservation => ({ kind: "photo", notes: subject, observation: { legible: true, showsDamageOrCondition: true, subject } });
const label = (hasTrackingNumber = true): AttachmentObservation => ({ kind: "shipping_label", notes: "l", observation: { legible: true, hasTrackingNumber, hasCarrier: true, hasAddress: true, hasShipDate: true } });
const upload = (caseId: string, category: string, obs: AttachmentObservation) =>
  uploadAttachment(agent, { caseId, fileName: `${category}.png`, declaredContentType: "image/png", category, bytes: png }, { observe: async () => obs });

const caseIds: string[] = [];
let policyId: string, ruleId: string;
beforeAll(async () => {
  policyId = (await db.policyDocument.create({ data: { name: CARRIER_CLAIMS_SOP_NAME, documentType: "carrier_agreement" } })).id;
  ruleId = (await db.rule.create({ data: { ruleName: "t", triggerType: "damaged_delivery", linkedPolicyDocumentId: policyId } })).id;
});
afterAll(async () => {
  await db.customerCase.deleteMany({ where: { id: { in: caseIds } } });
  await db.rule.delete({ where: { id: ruleId } });
  await db.policyDocument.delete({ where: { id: policyId } });
  await db.$disconnect();
});

async function newCase() {
  const c = await createCase(agent, { source: "email", customerName: "Msg Test", complaintText: "Váza prišla rozbitá" }, llm, proposalDeps);
  caseIds.push(c.id);
  calls.length = 0;
  return c;
}
const open = (caseId: string) => db.customerMessageDraft.findMany({ where: { linkedCaseId: caseId, status: "draft" } });

describe("getMissingEvidence", () => {
  it("lists the three carrier-claim items when there is no evidence", async () => {
    const c = await newCase();
    expect((await getMissingEvidence(c.id)).map((i) => i.text)).toEqual([
      "Shipping label photo (missing or not clear enough)",
      "Damaged item photo (missing or not clear enough)",
      "Outer carton photo (missing or not clear enough)",
    ]);
  });

  it("explains an insufficient label with the stored reason, and is empty once complete", async () => {
    const c = await newCase();
    await upload(c.id, "photo_evidence", photo("item"));
    await upload(c.id, "photo_evidence", photo("outer_carton"));
    await upload(c.id, "shipping_label", label(false));
    const texts = (await getMissingEvidence(c.id)).map((i) => i.text);
    expect(texts).toEqual([
      "Shipping label photo (missing or not clear enough)",
      "shipping_label.png (shipping label): Label is missing: tracking number.",
    ]);
    await upload(c.id, "shipping_label", label(true));
    expect(await getMissingEvidence(c.id)).toEqual([]);
  });

  it("includes the reviewer's note while it is current, and drops it after a new proposal replaces it", async () => {
    const c = await newCase();
    for (const [cat, o] of [["shipping_label", label()], ["photo_evidence", photo("item")], ["photo_evidence", photo("outer_carton")]] as const) await upload(c.id, cat, o);
    expect(await getMissingEvidence(c.id)).toEqual([]);
    const approval = await db.humanApproval.findFirstOrThrow({ where: { linkedCaseId: c.id, approvalType: "resolution_proposal" } });
    await reviewApproval(reviewer, approval.id, "evidence_requested", "Please add the purchase receipt");
    expect((await getMissingEvidence(c.id)).map((i) => i.text)).toEqual(["Please add the purchase receipt"]);
    await regenerateResolutionProposal(agent, c.id, proposalDeps);
    expect(await getMissingEvidence(c.id)).toEqual([]);
  });
});

describe("generateEvidenceRequest", () => {
  it("passes exactly the deterministic list to the AI, in the customer's language, and stores a snapshot", async () => {
    const c = await newCase();
    const d = await generateEvidenceRequest(agent, c.id, deps);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ customerName: "Msg Test", customerLanguage: "sk" });
    expect(calls[0].itemsToRequest).toEqual((await getMissingEvidence(c.id)).map((i) => i.text));
    expect(d).toMatchObject({ status: "draft", kind: "evidence_request", language: "sk", createdBy: "agent@test.io" });
    expect(d.body).toContain("Dobrý deň Msg Test");
    expect(d.missingItems).toEqual(calls[0].itemsToRequest);
    expect((await db.auditEvent.findFirstOrThrow({ where: { linkedCaseId: c.id, action: "evidence_request_drafted" } })).notes).toBe("3 item(s)");
  });

  it("refuses when nothing is missing and never calls the AI", async () => {
    const c = await newCase();
    for (const [cat, o] of [["shipping_label", label()], ["photo_evidence", photo("item")], ["photo_evidence", photo("outer_carton")]] as const) await upload(c.id, cat, o);
    await expect(generateEvidenceRequest(agent, c.id, deps)).rejects.toBeInstanceOf(MessageError);
    expect(calls).toHaveLength(0);
    expect(await db.customerMessageDraft.count({ where: { linkedCaseId: c.id } })).toBe(0);
  });

  it("requires sign-in", async () => {
    const c = await newCase();
    await expect(generateEvidenceRequest(null, c.id, deps)).rejects.toBeInstanceOf(AuthError);
  });

  it("an AI failure leaves the existing open draft untouched", async () => {
    const c = await newCase();
    const first = await generateEvidenceRequest(agent, c.id, deps);
    await expect(generateEvidenceRequest(agent, c.id, { generate: async () => { throw new Error("down"); } })).rejects.toThrow("down");
    expect((await open(c.id)).map((d) => d.id)).toEqual([first.id]);
  });

  it("a newer draft replaces the open one: a case never has two", async () => {
    const c = await newCase();
    const first = await generateEvidenceRequest(agent, c.id, deps);
    const second = await generateEvidenceRequest(agent, c.id, deps);
    expect((await db.customerMessageDraft.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("discarded");
    expect((await open(c.id)).map((d) => d.id)).toEqual([second.id]);
  });

  it("concurrent drafts converge to exactly one open draft", async () => {
    for (let round = 0; round < 4; round++) {
      const c = await newCase();
      // A barrier makes all three calls finish "the AI" together, so their transactions truly overlap.
      let arrived = 0;
      let release!: () => void;
      const barrier = new Promise<void>((r) => (release = r));
      const together: MessageDeps = {
        generate: async (ctx) => {
          if (++arrived === 3) release();
          await barrier;
          return deps.generate(ctx);
        },
      };
      await Promise.all([generateEvidenceRequest(agent, c.id, together), generateEvidenceRequest(agent, c.id, together), generateEvidenceRequest(agent, c.id, together)]);
      expect(await open(c.id)).toHaveLength(1);
      expect(await db.customerMessageDraft.count({ where: { linkedCaseId: c.id } })).toBe(3);
    }
  });
});

describe("edit, send and discard", () => {
  it("edits only an open draft, with a real change and non-empty text", async () => {
    const c = await newCase();
    const d = await generateEvidenceRequest(agent, c.id, deps);
    await expect(editMessageDraft(agent, d.id, "   ")).rejects.toThrow(/cannot be empty/);
    await expect(editMessageDraft(agent, d.id, d.body)).rejects.toThrow(/No changes/);
    const e = await editMessageDraft(agent, d.id, "Moja vlastná formulácia.");
    expect(e.body).toBe("Moja vlastná formulácia.");
    expect(await db.auditEvent.count({ where: { linkedCaseId: c.id, action: "evidence_request_edited" } })).toBe(1);
    await discardMessage(agent, d.id);
    await expect(editMessageDraft(agent, d.id, "again")).rejects.toThrow(/already discarded/);
  });

  it("marks sent as a manual attestation, once, and a sent message is final", async () => {
    const c = await newCase();
    const d = await generateEvidenceRequest(agent, c.id, deps);
    const sent = await markMessageSent(agent, d.id);
    expect(sent).toMatchObject({ status: "sent", sentBy: "agent@test.io" });
    expect(sent.sentAt).not.toBeNull();
    await expect(markMessageSent(agent, d.id)).rejects.toThrow(/already sent/);
    await expect(discardMessage(agent, d.id)).rejects.toThrow(/already sent/);
    await expect(editMessageDraft(agent, d.id, "x")).rejects.toThrow(/already sent/);
  });

  it("refuses to send an obsolete request once the evidence is complete (discarding still works)", async () => {
    const c = await newCase();
    const d = await generateEvidenceRequest(agent, c.id, deps);
    for (const [cat, o] of [["shipping_label", label()], ["photo_evidence", photo("item")], ["photo_evidence", photo("outer_carton")]] as const) await upload(c.id, cat, o);
    await expect(markMessageSent(agent, d.id)).rejects.toThrow(/obsolete/);
    expect((await db.customerMessageDraft.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("draft");
    expect((await discardMessage(agent, d.id)).status).toBe("discarded");
  });

  it("two concurrent sends: exactly one wins", async () => {
    const c = await newCase();
    const d = await generateEvidenceRequest(agent, c.id, deps);
    const r = await Promise.allSettled([markMessageSent(agent, d.id), markMessageSent(agent, d.id)]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await db.auditEvent.count({ where: { linkedCaseId: c.id, action: "evidence_request_sent" } })).toBe(1);
  });

  it("deleting the case deletes its drafts", async () => {
    const c = await createCase(agent, { source: "email", customerName: "Msg Cascade", complaintText: "x" }, llm, proposalDeps);
    const d = await generateEvidenceRequest(agent, c.id, deps);
    await db.customerCase.delete({ where: { id: c.id } });
    expect(await db.customerMessageDraft.count({ where: { id: d.id } })).toBe(0);
  });
});
