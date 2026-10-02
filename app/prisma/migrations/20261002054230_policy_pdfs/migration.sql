-- AlterTable
ALTER TABLE "ResolutionProposal" ADD COLUMN     "citations" JSONB;

-- CreateTable
CREATE TABLE "PolicyDocumentFile" (
    "policyDocumentId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "pageCount" INTEGER NOT NULL,
    "emptyPages" INTEGER NOT NULL,
    "passageCount" INTEGER NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyDocumentFile_pkey" PRIMARY KEY ("policyDocumentId")
);

-- CreateTable
CREATE TABLE "PolicyPassage" (
    "id" TEXT NOT NULL,
    "policyDocumentId" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyPassage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PolicyPassage_policyDocumentId_page_ordinal_idx" ON "PolicyPassage"("policyDocumentId", "page", "ordinal");

-- AddForeignKey
ALTER TABLE "PolicyDocumentFile" ADD CONSTRAINT "PolicyDocumentFile_policyDocumentId_fkey" FOREIGN KEY ("policyDocumentId") REFERENCES "PolicyDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyPassage" ADD CONSTRAINT "PolicyPassage_policyDocumentId_fkey" FOREIGN KEY ("policyDocumentId") REFERENCES "PolicyDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Full-text search over passages. The query uses exactly this expression so the index is used.
CREATE INDEX "PolicyPassage_fts" ON "PolicyPassage" USING GIN (to_tsvector('english', "text"));
