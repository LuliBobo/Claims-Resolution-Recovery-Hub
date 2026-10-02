import { REVIEW_ROLES, requireRole, type Actor } from "@/server/auth";
import { db } from "@/server/db";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES, sniffContentType } from "@/lib/file-sniff";
import { chunkPages } from "./chunk";
import { extractPdfPages, PdfError } from "./extract-pdf";

export const MAX_PASSAGES = 3000;

export interface IngestResult {
  pageCount: number;
  emptyPages: number;
  passageCount: number;
}

/**
 * Stores a policy document's PDF and (re)builds its searchable passages. Reviewer/admin only. The
 * real type is sniffed from the bytes, not trusted from the client. Re-uploading replaces the file and
 * every passage atomically; concurrent uploads for one document are serialized.
 */
export async function ingestPolicyPdf(actor: Actor | null, policyDocumentId: string, file: { fileName: string; bytes: Uint8Array }): Promise<IngestResult> {
  const user = requireRole(actor, ...REVIEW_ROLES);
  if (file.bytes.length === 0) throw new PdfError("File is empty");
  if (file.bytes.length > MAX_UPLOAD_BYTES) throw new PdfError(`File exceeds the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit`);
  const sniffed = sniffContentType(file.bytes);
  if (sniffed !== "application/pdf" || !ALLOWED_UPLOAD_TYPES.has(sniffed)) throw new PdfError("Only PDF files can be uploaded as policy documents");

  await db.policyDocument.findUniqueOrThrow({ where: { id: policyDocumentId }, select: { id: true } });
  const { pages, pageCount, emptyPages } = await extractPdfPages(file.bytes);
  const passages = chunkPages(pages);
  if (passages.length > MAX_PASSAGES) throw new PdfError(`PDF yields ${passages.length} passages; the limit is ${MAX_PASSAGES}`);

  await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"policy-pdf:" + policyDocumentId}))`;
      await tx.policyPassage.deleteMany({ where: { policyDocumentId } });
      await tx.policyPassage.createMany({ data: passages.map((p) => ({ policyDocumentId, page: p.page, ordinal: p.ordinal, text: p.text })) });
      const data = {
        fileName: file.fileName.split(/[\\/]/).pop() || "policy.pdf",
        bytes: Uint8Array.from(file.bytes),
        pageCount,
        emptyPages,
        passageCount: passages.length,
        uploadedBy: user.email,
        uploadedAt: new Date(),
      };
      await tx.policyDocumentFile.upsert({ where: { policyDocumentId }, create: { policyDocumentId, ...data }, update: data });
    },
    { timeout: 30_000, maxWait: 30_000 },
  );
  return { pageCount, emptyPages, passageCount: passages.length };
}

/** Removes the PDF and its passages (the policy document itself stays). */
export async function deletePolicyPdf(actor: Actor | null, policyDocumentId: string) {
  requireRole(actor, ...REVIEW_ROLES);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"policy-pdf:" + policyDocumentId}))`;
    await tx.policyPassage.deleteMany({ where: { policyDocumentId } });
    await tx.policyDocumentFile.deleteMany({ where: { policyDocumentId } });
  });
}

export async function loadPolicyPdf(policyDocumentId: string) {
  const f = await db.policyDocumentFile.findUnique({ where: { policyDocumentId }, select: { fileName: true, bytes: true } });
  return f ? { fileName: f.fileName, bytes: new Uint8Array(f.bytes) } : null;
}
