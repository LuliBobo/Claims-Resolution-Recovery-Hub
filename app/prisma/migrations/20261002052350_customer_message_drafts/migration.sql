-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('evidence_request');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('draft', 'sent', 'discarded');

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "evidenceReason" TEXT;

-- CreateTable
CREATE TABLE "CustomerMessageDraft" (
    "id" TEXT NOT NULL,
    "linkedCaseId" TEXT NOT NULL,
    "kind" "MessageKind" NOT NULL,
    "language" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "missingItems" JSONB NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'draft',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "sentBy" TEXT,

    CONSTRAINT "CustomerMessageDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerMessageDraft_linkedCaseId_createdAt_idx" ON "CustomerMessageDraft"("linkedCaseId", "createdAt");

-- AddForeignKey
ALTER TABLE "CustomerMessageDraft" ADD CONSTRAINT "CustomerMessageDraft_linkedCaseId_fkey" FOREIGN KEY ("linkedCaseId") REFERENCES "CustomerCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
