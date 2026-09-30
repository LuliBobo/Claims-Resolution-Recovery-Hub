import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";

// Attachment byte storage. Bytes live in Postgres (AttachmentBlob), written in the SAME
// transaction as the Attachment row, so there are never orphaned files, and deleting an
// attachment or case deletes its bytes. Access goes through the authenticated download route.
// This is a two-function interface on purpose: to move to object storage (S3, Vercel Blob),
// change only these bodies. `storageRef` on Attachment stays an opaque reference string.

type Tx = Prisma.TransactionClient;

export const storageRefFor = (attachmentId: string) => `db://${attachmentId}`;

export async function storeAttachmentBytes(tx: Tx, attachmentId: string, bytes: Uint8Array) {
  await tx.attachmentBlob.create({ data: { attachmentId, bytes: Uint8Array.from(bytes) } });
}

/** Returns null when no bytes exist (e.g. synthetic seed attachments, which have no file). */
export async function loadAttachmentBytes(attachmentId: string, client: Tx | typeof db = db): Promise<Uint8Array | null> {
  const row = await client.attachmentBlob.findUnique({ where: { attachmentId }, select: { bytes: true } });
  return row ? new Uint8Array(row.bytes) : null;
}
