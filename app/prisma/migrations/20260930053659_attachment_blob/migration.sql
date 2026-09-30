-- CreateTable
CREATE TABLE "AttachmentBlob" (
    "attachmentId" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttachmentBlob_pkey" PRIMARY KEY ("attachmentId")
);

-- AddForeignKey
ALTER TABLE "AttachmentBlob" ADD CONSTRAINT "AttachmentBlob_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
