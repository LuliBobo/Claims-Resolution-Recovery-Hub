import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Actor } from "@/server/auth";
import { AuthError } from "@/server/auth";
import { db } from "@/server/db";
import { createCase, type IntakeLlm } from "@/server/workflows/case-intake";
import { updateCase } from "@/server/workflows/case-management";
import { UploadError, uploadAttachment } from "@/server/workflows/upload-attachment";

const agent: Actor = { id: "u1", email: "agent@test.io", name: "A", role: "agent" };
const complaint = { source: "email", customerName: "Test Customer", complaintText: "Tovar prišiel rozbitý." };

const okLlm: IntakeLlm = {
  summarize: async () => ({ customerLanguage: "SK", internalEnglishSummary: "Goods arrived broken." }),
  classify: async () => ({ caseType: "damaged_delivery", priority: "high" }),
};
const failingLlm: IntakeLlm = {
  summarize: async () => { throw new Error("boom"); },
  classify: async () => { throw new Error("boom"); },
};

const createdCaseIds: string[] = [];
beforeAll(async () => {
  process.env.UPLOAD_DIR = await mkdtemp(path.join(tmpdir(), "uploads-"));
});
afterAll(async () => {
  await db.customerCase.deleteMany({ where: { id: { in: createdCaseIds } } });
  await db.$disconnect();
});

describe("createCase", () => {
  it("fills language, summary, type and priority from the LLM and audits creation", async () => {
    const c = await createCase(agent, complaint, okLlm);
    createdCaseIds.push(c.id);
    expect(c).toMatchObject({ customerLanguage: "sk", caseType: "damaged_delivery", priority: "high", needsManualTriage: false });
    const events = await db.auditEvent.findMany({ where: { linkedCaseId: c.id } });
    expect(events.map((e) => e.action)).toEqual(["case_created"]);
  });

  it("still creates the case when the LLM fails, flagged for manual triage", async () => {
    const c = await createCase(agent, complaint, failingLlm);
    createdCaseIds.push(c.id);
    expect(c).toMatchObject({ needsManualTriage: true, caseType: "other", priority: "medium", internalEnglishSummary: null });
    const actions = (await db.auditEvent.findMany({ where: { linkedCaseId: c.id } })).map((e) => e.action);
    expect(actions.filter((a) => a === "llm_step_failed")).toHaveLength(2);
  });

  it("does not classify when type and priority are supplied", async () => {
    let classified = false;
    const c = await createCase(
      agent,
      { ...complaint, caseType: "wrong_item", priority: "low" },
      { ...okLlm, classify: async () => { classified = true; return { caseType: "other", priority: "urgent" }; } },
    );
    createdCaseIds.push(c.id);
    expect(classified).toBe(false);
    expect(c).toMatchObject({ caseType: "wrong_item", priority: "low" });
  });

  it("requires authentication", async () => {
    await expect(createCase(null, complaint, okLlm)).rejects.toBeInstanceOf(AuthError);
  });
});

describe("updateCase", () => {
  it("logs status changes as previous -> new and stamps resolvedAt", async () => {
    const c = await createCase(agent, complaint, okLlm);
    createdCaseIds.push(c.id);
    const u = await updateCase(agent, c.id, { status: "resolved" });
    expect(u.resolvedAt).not.toBeNull();
    const ev = await db.auditEvent.findFirstOrThrow({ where: { linkedCaseId: c.id, action: "status_changed" } });
    expect([ev.previousState, ev.newState]).toEqual(["new", "resolved"]);
  });
});

describe("uploadAttachment", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

  it("stores sniffed and declared types and flags a mismatch", async () => {
    const c = await createCase(agent, complaint, okLlm);
    createdCaseIds.push(c.id);
    const ok = await uploadAttachment(agent, { caseId: c.id, fileName: "a.png", declaredContentType: "image/png", category: "photo_evidence", bytes: png });
    expect(ok).toMatchObject({ sniffedContentType: "image/png", contentTypeMismatch: false, evidenceStatus: "pending_review" });
    const liar = await uploadAttachment(agent, { caseId: c.id, fileName: "../../b.pdf", declaredContentType: "application/pdf", category: "other", bytes: png });
    expect(liar).toMatchObject({ sniffedContentType: "image/png", declaredContentType: "application/pdf", contentTypeMismatch: true, fileName: "b.pdf" });
  });

  it("rejects content that is not an allowed type regardless of the declared type", async () => {
    const c = await createCase(agent, complaint, okLlm);
    createdCaseIds.push(c.id);
    const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);
    await expect(
      uploadAttachment(agent, { caseId: c.id, fileName: "x.jpg", declaredContentType: "image/jpeg", category: "photo_evidence", bytes: exe }),
    ).rejects.toBeInstanceOf(UploadError);
    expect(await db.attachment.count({ where: { linkedCaseId: c.id } })).toBe(0);
  });
});
