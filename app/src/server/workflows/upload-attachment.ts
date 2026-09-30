import { ANY_ROLE, requireRole, type Actor } from "@/server/auth";
import { db } from "@/server/db";
import { logAuditEvent } from "@/server/audit";
import { putBlob } from "@/server/storage";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES, sniffContentType } from "@/lib/file-sniff";
import { ATTACHMENT_CATEGORIES } from "@/lib/validation/case";
import { assessObservation, type AttachmentObservation } from "@/server/evidence/assess";
import { observeAttachment, type JudgeInput } from "@/server/llm/judge-evidence";

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadError";
  }
}

export interface UploadInput {
  caseId: string;
  fileName: string;
  declaredContentType: string;
  category: string;
  bytes: Uint8Array;
}

export interface UploadDeps {
  observe: (input: JudgeInput) => Promise<AttachmentObservation>;
}
const defaultDeps: UploadDeps = { observe: observeAttachment };

/**
 * Stores an attachment. The declared MIME type is untrusted: the real type is sniffed from
 * the bytes, and only sniffed-allowed types are accepted. Both are stored, with a mismatch
 * flag. The evidence judge then sets evidenceStatus (stays pending_review if it fails).
 */
export async function uploadAttachment(actor: Actor | null, input: UploadInput, deps: UploadDeps = defaultDeps) {
  const user = requireRole(actor, ...ANY_ROLE);
  if (!(ATTACHMENT_CATEGORIES as readonly string[]).includes(input.category)) {
    throw new UploadError("Unknown attachment category");
  }
  if (input.bytes.length === 0) throw new UploadError("File is empty");
  if (input.bytes.length > MAX_UPLOAD_BYTES) throw new UploadError("File exceeds the 10 MB limit");

  const sniffed = sniffContentType(input.bytes);
  if (!sniffed || !ALLOWED_UPLOAD_TYPES.has(sniffed)) {
    throw new UploadError("Unsupported file content (allowed: JPEG, PNG, GIF, WebP, PDF, plain text)");
  }
  const declared = input.declaredContentType.split(";")[0].trim().toLowerCase();
  const mismatch = declared !== sniffed;

  await db.customerCase.findUniqueOrThrow({ where: { id: input.caseId }, select: { id: true } });
  const storageRef = await putBlob(input.bytes);

  const created = await db.$transaction(async (tx) => {
    const attachment = await tx.attachment.create({
      data: {
        linkedCaseId: input.caseId,
        // Keep only the base name; the client controls this string.
        fileName: input.fileName.split(/[\\/]/).pop() || "upload",
        declaredContentType: declared,
        sniffedContentType: sniffed,
        contentTypeMismatch: mismatch,
        attachmentCategory: input.category as (typeof ATTACHMENT_CATEGORIES)[number],
        storageRef,
      },
    });
    await logAuditEvent(
      {
        caseId: input.caseId,
        actor: user.email,
        action: "attachment_uploaded",
        newState: attachment.attachmentCategory,
        notes: mismatch
          ? `${attachment.fileName}: declared ${declared} but content is ${sniffed}`
          : attachment.fileName,
      },
      tx,
    );
    return attachment;
  });

  // Judge sufficiency (LLM observes, pure modules decide). On failure the attachment stays
  // pending_review, which the gate treats as not sufficient (fail-safe).
  const c = await db.customerCase.findUniqueOrThrow({
    where: { id: input.caseId },
    select: { internalEnglishSummary: true, complaintText: true },
  });
  try {
    const observation = await deps.observe({
      category: created.attachmentCategory,
      fileName: created.fileName,
      contentType: sniffed,
      bytes: input.bytes,
      complaintSummary: c.internalEnglishSummary ?? c.complaintText.slice(0, 500),
    });
    const a = assessObservation(observation);
    return db.$transaction(async (tx) => {
      const updated = await tx.attachment.update({
        where: { id: created.id },
        data: { evidenceStatus: a.status, aiNotes: a.notes, photoSubject: a.photoSubject },
      });
      await logAuditEvent(
        { caseId: input.caseId, actor: "system", action: "evidence_judged", previousState: "pending_review", newState: a.status, notes: `${created.fileName}: ${a.reason}` },
        tx,
      );
      return updated;
    });
  } catch (e) {
    await logAuditEvent({
      caseId: input.caseId,
      actor: "system",
      action: "llm_step_failed",
      notes: `evidence judging failed for ${created.fileName}: ${e instanceof Error ? e.message : String(e)}`,
    });
    return created;
  }
}
