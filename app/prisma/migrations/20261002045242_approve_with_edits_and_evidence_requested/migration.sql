-- AlterEnum
ALTER TYPE "ApprovalDecision" ADD VALUE 'evidence_requested';

-- AlterEnum
ALTER TYPE "ProposalStatus" ADD VALUE 'evidence_requested';

-- AlterEnum
ALTER TYPE "RecoveryDraftStatus" ADD VALUE 'evidence_requested';

-- AlterTable
ALTER TABLE "HumanApproval" ADD COLUMN     "edits" JSONB;
