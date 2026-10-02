import { afterAll, describe, expect, it } from "vitest";
import type { Actor } from "@/server/auth";
import { AuthError } from "@/server/auth";
import { db } from "@/server/db";
import { createCase, type IntakeLlm } from "@/server/workflows/case-intake";
import { updateCase } from "@/server/workflows/case-management";
import { UploadError, uploadAttachment } from "@/server/workflows/upload-attachment";
import { MAX_UPLOAD_BYTES } from "@/lib/file-sniff";
import { loadAttachmentBytes, storageRefFor, storeAttachmentBytes } from "@/server/storage";

const agent: Actor = { id: "u1", email: "agent@test.io", name: "A", role: "agent" };
const complaint = { source: "email", customerName: "Test Customer", complaintText: "Tovar prišiel rozbitý." };

const okLlm: IntakeLlm = {
  summarize: async () => ({ customerLanguage: "SK", internalEnglishSummary: "Goods arrived broken." }),
  classify: async () => ({ caseType: "damaged_delivery", priority: "high", confidence: 0.9 }),
};
const failingLlm: IntakeLlm = {
  summarize: async () => { throw new Error("boom"); },
  classify: async () => { throw new Error("boom"); },
};

// Stub proposal generator so these tests never touch the network.
const proposalOk = {
  generate: async () => ({
    recommendation: "Replace item", rationale: "r", confidence: 0.7, customerImpact: "low",
    businessExposure: "low", policySource: "none", needsHumanApproval: true, customerReplyDraft: "hi",
  }),
};
const proposalDown = { generate: async () => { throw new Error("down"); } };

const createdCaseIds: string[] = [];
afterAll(async () => {
  await db.customerCase.deleteMany({ where: { id: { in: createdCaseIds } } });
  await db.$disconnect();
});

describe("createCase", () => {
  it("fills language, summary, type and priority from the LLM and audits creation", async () => {
    const c = await createCase(agent, complaint, okLlm, proposalOk);
    createdCaseIds.push(c.id);
    expect(c).toMatchObject({ customerLanguage: "sk", caseType: "damaged_delivery", priority: "high", needsManualTriage: false, classificationConfidence: 0.9 });
    const events = await db.auditEvent.findMany({ where: { linkedCaseId: c.id } });
    expect(events.map((e) => e.action)).toEqual(expect.arrayContaining(["case_created", "resolution_proposal_generated"]));
  });

  it("still creates the case when the LLM fails, flagged for manual triage", async () => {
    const c = await createCase(agent, complaint, failingLlm, proposalDown);
    createdCaseIds.push(c.id);
    expect(c).toMatchObject({ needsManualTriage: true, caseType: "other", priority: "medium", internalEnglishSummary: null });
    const actions = (await db.auditEvent.findMany({ where: { linkedCaseId: c.id } })).map((e) => e.action);
    expect(actions.filter((a) => a === "llm_step_failed")).toHaveLength(3); // summary, classification, proposal
  });

  it("does not classify when type and priority are supplied", async () => {
    let classified = false;
    const c = await createCase(
      agent,
      { ...complaint, caseType: "wrong_item", priority: "low" },
      { ...okLlm, classify: async () => { classified = true; return { caseType: "other", priority: "urgent", confidence: 0.5 }; } },
      proposalOk,
    );
    createdCaseIds.push(c.id);
    expect(classified).toBe(false);
    expect(c).toMatchObject({ caseType: "wrong_item", priority: "low" });
  });

  it("requires authentication", async () => {
    await expect(createCase(null, complaint, okLlm)).rejects.toBeInstanceOf(AuthError);
  });
});

describe("createCase LLM steps", () => {
  it("starts summary and classification concurrently", async () => {
    let started = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const enter = async () => {
      started++;
      if (started === 2) release();
      await Promise.race([gate, new Promise((r) => setTimeout(r, 2000))]);
    };
    const llm: IntakeLlm = {
      summarize: async () => (await enter(), { customerLanguage: "es", internalEnglishSummary: "s" }),
      classify: async () => (await enter(), { caseType: "damaged_delivery", priority: "medium", confidence: 0.9 }),
    };
    const t0 = Date.now();
    const c = await createCase(agent, complaint, llm, proposalOk);
    createdCaseIds.push(c.id);
    expect(started).toBe(2);
    expect(Date.now() - t0).toBeLessThan(1800); // sequential execution would wait out the 2s timeout
    expect(c.needsManualTriage).toBe(false);
  });
});

describe("updateCase", () => {
  it("logs status changes as previous -> new and stamps resolvedAt", async () => {
    const c = await createCase(agent, complaint, okLlm, proposalOk);
    createdCaseIds.push(c.id);
    const u = await updateCase(agent, c.id, { status: "resolved" });
    expect(u.resolvedAt).not.toBeNull();
    const ev = await db.auditEvent.findFirstOrThrow({ where: { linkedCaseId: c.id, action: "status_changed", newState: "resolved" } });
    expect([ev.previousState, ev.newState]).toEqual(["awaiting_approval", "resolved"]);
  });

  it("assigns, keeps and clears the assigned reviewer", async () => {
    const c = await createCase(agent, complaint, okLlm, proposalOk);
    createdCaseIds.push(c.id);
    expect((await updateCase(agent, c.id, { assignedReviewer: "riley@test.io" })).assignedReviewer).toBe("riley@test.io");
    expect((await updateCase(agent, c.id, { status: "in_review" })).assignedReviewer).toBe("riley@test.io");
    expect((await updateCase(agent, c.id, { assignedReviewer: "  " })).assignedReviewer).toBeNull();
    const ev = await db.auditEvent.findMany({ where: { linkedCaseId: c.id, action: "assignedReviewer_changed" }, orderBy: { eventTime: "asc" } });
    expect(ev.map((e) => [e.previousState, e.newState])).toEqual([[null, "riley@test.io"], ["riley@test.io", null]]);
  });

  it("lets only a reviewer or admin change case type or priority; agents may resubmit unchanged values", async () => {
    const c = await createCase(agent, complaint, okLlm, proposalOk);
    createdCaseIds.push(c.id);
    await expect(updateCase(agent, c.id, { caseType: "other" })).rejects.toBeInstanceOf(AuthError);
    await expect(updateCase(agent, c.id, { priority: c.priority === "low" ? "high" : "low" })).rejects.toBeInstanceOf(AuthError);
    await updateCase(agent, c.id, { caseType: c.caseType, priority: c.priority, status: "in_review" });
    const reviewer: Actor = { id: "u2", email: "rev@test.io", name: "R", role: "reviewer" };
    expect((await updateCase(reviewer, c.id, { caseType: "other" })).caseType).toBe("other");
  });
});

describe("uploadAttachment", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

  it("stores sniffed and declared types and flags a mismatch", async () => {
    const c = await createCase(agent, complaint, okLlm, proposalOk);
    createdCaseIds.push(c.id);
    const ok = await uploadAttachment(agent, { caseId: c.id, fileName: "a.png", declaredContentType: "image/png", category: "photo_evidence", bytes: png });
    expect(ok).toMatchObject({ sniffedContentType: "image/png", contentTypeMismatch: false, evidenceStatus: "pending_review" });
    const liar = await uploadAttachment(agent, { caseId: c.id, fileName: "../../b.pdf", declaredContentType: "application/pdf", category: "other", bytes: png });
    expect(liar).toMatchObject({ sniffedContentType: "image/png", declaredContentType: "application/pdf", contentTypeMismatch: true, fileName: "b.pdf" });
  });

  it("rejects content that is not an allowed type regardless of the declared type", async () => {
    const c = await createCase(agent, complaint, okLlm, proposalOk);
    createdCaseIds.push(c.id);
    const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);
    await expect(
      uploadAttachment(agent, { caseId: c.id, fileName: "x.jpg", declaredContentType: "image/jpeg", category: "photo_evidence", bytes: exe }),
    ).rejects.toBeInstanceOf(UploadError);
    expect(await db.attachment.count({ where: { linkedCaseId: c.id } })).toBe(0);
  });

  it("requires an image for photo evidence and an image or PDF for a shipping label", async () => {
    const c = await createCase(agent, complaint, okLlm, proposalOk);
    createdCaseIds.push(c.id);
    const pdf = new TextEncoder().encode("%PDF-1.4 fake");
    const text = new TextEncoder().encode("I swear there is a photo");
    const up = (category: string, bytes: Uint8Array) =>
      uploadAttachment(agent, { caseId: c.id, fileName: "f", declaredContentType: "image/png", category, bytes }, { observe: async () => { throw new Error("skip"); } });
    await expect(up("photo_evidence", pdf)).rejects.toBeInstanceOf(UploadError);
    await expect(up("photo_evidence", text)).rejects.toBeInstanceOf(UploadError);
    await expect(up("shipping_label", text)).rejects.toBeInstanceOf(UploadError);
    expect((await up("shipping_label", pdf)).sniffedContentType).toBe("application/pdf");
    expect((await up("other", text)).sniffedContentType).toBe("text/plain");
  });
});

describe("attachment byte storage", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 8, 7, 6]);
  const noJudge = { observe: async () => { throw new Error("skip"); } };

  it("stores the bytes with the attachment and returns them unchanged", async () => {
    const c = await createCase(agent, complaint, okLlm, proposalOk);
    createdCaseIds.push(c.id);
    const a = await uploadAttachment(agent, { caseId: c.id, fileName: "a.png", declaredContentType: "image/png", category: "photo_evidence", bytes: png }, noJudge);
    expect(a.storageRef).toBe(`db://${a.id}`);
    expect(Array.from((await loadAttachmentBytes(a.id))!)).toEqual(Array.from(png));
    expect(await loadAttachmentBytes("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("row and bytes are atomic: a failure after the row is created leaves neither", async () => {
    const c = await createCase(agent, complaint, okLlm, proposalOk);
    createdCaseIds.push(c.id);
    const id = "11111111-1111-1111-1111-111111111111";
    await expect(
      db.$transaction(async (tx) => {
        await tx.attachment.create({ data: { id, linkedCaseId: c.id, fileName: "x", declaredContentType: "image/png", storageRef: storageRefFor(id) } });
        await storeAttachmentBytes(tx, id, png);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await db.attachment.count({ where: { id } })).toBe(0);
    expect(await loadAttachmentBytes(id)).toBeNull();
  });

  it("deleting the case deletes the attachment bytes", async () => {
    const c = await createCase(agent, complaint, okLlm, proposalOk);
    const a = await uploadAttachment(agent, { caseId: c.id, fileName: "a.png", declaredContentType: "image/png", category: "other", bytes: png }, noJudge);
    expect(await db.attachmentBlob.count({ where: { attachmentId: a.id } })).toBe(1);
    await db.customerCase.delete({ where: { id: c.id } });
    expect(await db.attachmentBlob.count({ where: { attachmentId: a.id } })).toBe(0);
  });

  it("rejects files over the size limit and stores nothing", async () => {
    const c = await createCase(agent, complaint, okLlm, proposalOk);
    createdCaseIds.push(c.id);
    const big = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await expect(
      uploadAttachment(agent, { caseId: c.id, fileName: "big.png", declaredContentType: "image/png", category: "other", bytes: big }, noJudge),
    ).rejects.toThrow(/MB limit/);
    expect(await db.attachment.count({ where: { linkedCaseId: c.id } })).toBe(0);
  });
});
