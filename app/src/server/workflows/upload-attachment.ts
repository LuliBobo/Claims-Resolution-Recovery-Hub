import { ANY_ROLE, requireRole, type Actor } from "@/server/auth";
import { db } from "@/server/db";
import { logAuditEvent } from "@/server/audit";
import { putBlob } from "@/server/storage";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES, sniffContentType } from "@/lib/file-sniff";
import { ATTACHMENT_CATEGORIES } from "@/lib/validation/case";

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

/**
 * Stores an attachment. The declared MIME type is untrusted: the real type is sniffed from
 * the bytes, and only sniffed-allowed types are accepted. Both are stored, with a mismatch
 * flag. evidenceStatus starts at pending_review; sufficiency judging arrives in M4.
 */
export async function uploadAttachment(actor: Actor | null, input: UploadInput) {
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

  return db.$transaction(async (tx) => {
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
}
