-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('agent', 'reviewer', 'admin');

-- CreateEnum
CREATE TYPE "CaseType" AS ENUM ('damaged_delivery', 'wrong_item', 'missing_item', 'return_request', 'other');

-- CreateEnum
CREATE TYPE "CasePriority" AS ENUM ('low', 'medium', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "CaseSource" AS ENUM ('email', 'chat', 'phone', 'marketplace', 'web_form', 'other');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('new', 'in_review', 'awaiting_approval', 'resolved', 'escalated', 'closed');

-- CreateEnum
CREATE TYPE "AttachmentCategory" AS ENUM ('photo_evidence', 'invoice', 'shipping_label', 'correspondence', 'other');

-- CreateEnum
CREATE TYPE "EvidenceStatus" AS ENUM ('pending_review', 'sufficient', 'insufficient', 'not_applicable');

-- CreateEnum
CREATE TYPE "ApprovalType" AS ENUM ('resolution_proposal', 'recovery_draft');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('pending', 'approved', 'rejected', 'superseded');

-- CreateEnum
CREATE TYPE "InsightTrend" AS ENUM ('up', 'down', 'stable');

-- CreateEnum
CREATE TYPE "PolicyDocumentType" AS ENUM ('policy', 'terms', 'carrier_agreement', 'supplier_agreement', 'other');

-- CreateEnum
CREATE TYPE "RecoveryCounterpartyType" AS ENUM ('carrier', 'supplier');

-- CreateEnum
CREATE TYPE "RecoveryDraftStatus" AS ENUM ('draft', 'pending_approval', 'approved', 'sent', 'rejected', 'resolved');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('pending_approval', 'approved', 'rejected', 'sent', 'superseded');

-- CreateEnum
CREATE TYPE "RuleTriggerType" AS ENUM ('damaged_delivery', 'wrong_item', 'missing_item', 'return_request', 'other');

-- CreateEnum
CREATE TYPE "ShipmentDeliveryStatus" AS ENUM ('pending', 'in_transit', 'delivered', 'delayed', 'lost', 'returned');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'agent',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderDate" TIMESTAMP(3) NOT NULL,
    "salesChannel" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "sku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "orderValue" DECIMAL(12,2) NOT NULL,
    "supplier" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "linkedOrderId" TEXT NOT NULL,
    "carrier" TEXT NOT NULL,
    "trackingNumber" TEXT NOT NULL,
    "warehouse" TEXT,
    "shipDate" TIMESTAMP(3),
    "deliveryDate" TIMESTAMP(3),
    "deliveryStatus" "ShipmentDeliveryStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyDocument" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "documentType" "PolicyDocumentType" NOT NULL,
    "version" TEXT,
    "jurisdiction" TEXT,
    "activeStatus" BOOLEAN NOT NULL DEFAULT true,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolicyDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rule" (
    "id" TEXT NOT NULL,
    "ruleName" TEXT NOT NULL,
    "triggerType" "RuleTriggerType" NOT NULL,
    "requiredEvidence" TEXT,
    "recommendedResolution" TEXT,
    "escalationPath" TEXT,
    "linkedPolicyDocumentId" TEXT,
    "activeStatus" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerCase" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "CaseSource" NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'new',
    "caseType" "CaseType" NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "customerLanguage" TEXT NOT NULL DEFAULT 'en',
    "orderReference" TEXT,
    "complaintText" TEXT NOT NULL,
    "internalEnglishSummary" TEXT,
    "priority" "CasePriority" NOT NULL DEFAULT 'medium',
    "linkedOrderId" TEXT,
    "linkedShipmentId" TEXT,
    "resolutionRecommendation" TEXT,
    "recoveryNeeded" BOOLEAN NOT NULL DEFAULT false,
    "assignedReviewer" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "needsManualTriage" BOOLEAN NOT NULL DEFAULT false,
    "currentResolutionProposalId" TEXT,

    CONSTRAINT "CustomerCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "linkedCaseId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "declaredContentType" TEXT NOT NULL,
    "sniffedContentType" TEXT,
    "contentTypeMismatch" BOOLEAN NOT NULL DEFAULT false,
    "attachmentCategory" "AttachmentCategory" NOT NULL DEFAULT 'other',
    "aiNotes" TEXT,
    "evidenceStatus" "EvidenceStatus" NOT NULL DEFAULT 'pending_review',
    "storageRef" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResolutionProposal" (
    "id" TEXT NOT NULL,
    "linkedCaseId" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "customerImpact" TEXT,
    "businessExposure" TEXT,
    "policySource" TEXT,
    "needsHumanApproval" BOOLEAN NOT NULL DEFAULT true,
    "status" "ProposalStatus" NOT NULL DEFAULT 'pending_approval',
    "customerReplyDraft" TEXT,
    "evidenceGateApplied" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(3),

    CONSTRAINT "ResolutionProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryDraft" (
    "id" TEXT NOT NULL,
    "linkedCaseId" TEXT NOT NULL,
    "counterpartyType" "RecoveryCounterpartyType" NOT NULL,
    "counterpartyName" TEXT NOT NULL,
    "claimType" TEXT NOT NULL,
    "draftText" TEXT NOT NULL,
    "estimatedRecoverableValue" DECIMAL(12,2),
    "status" "RecoveryDraftStatus" NOT NULL DEFAULT 'draft',
    "approvedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "linkedCaseId" TEXT NOT NULL,
    "eventTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "previousState" TEXT,
    "newState" TEXT,
    "ruleSource" TEXT,
    "notes" TEXT,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HumanApproval" (
    "id" TEXT NOT NULL,
    "linkedCaseId" TEXT NOT NULL,
    "approvalType" "ApprovalType" NOT NULL,
    "linkedResolutionProposalId" TEXT,
    "linkedRecoveryDraftId" TEXT,
    "reviewer" TEXT,
    "decision" "ApprovalDecision" NOT NULL DEFAULT 'pending',
    "reviewerComment" TEXT,
    "decisionTime" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HumanApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsightRecord" (
    "id" TEXT NOT NULL,
    "sku" TEXT,
    "carrier" TEXT,
    "supplier" TEXT,
    "warehouse" TEXT,
    "issueType" TEXT NOT NULL,
    "frequency" INTEGER NOT NULL,
    "trendDirection" "InsightTrend" NOT NULL DEFAULT 'stable',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsightRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Shipment_linkedOrderId_idx" ON "Shipment"("linkedOrderId");

-- CreateIndex
CREATE INDEX "Rule_triggerType_activeStatus_idx" ON "Rule"("triggerType", "activeStatus");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerCase_currentResolutionProposalId_key" ON "CustomerCase"("currentResolutionProposalId");

-- CreateIndex
CREATE INDEX "CustomerCase_status_idx" ON "CustomerCase"("status");

-- CreateIndex
CREATE INDEX "CustomerCase_createdAt_idx" ON "CustomerCase"("createdAt");

-- CreateIndex
CREATE INDEX "CustomerCase_linkedOrderId_idx" ON "CustomerCase"("linkedOrderId");

-- CreateIndex
CREATE INDEX "CustomerCase_linkedShipmentId_idx" ON "CustomerCase"("linkedShipmentId");

-- CreateIndex
CREATE INDEX "Attachment_linkedCaseId_idx" ON "Attachment"("linkedCaseId");

-- CreateIndex
CREATE INDEX "ResolutionProposal_linkedCaseId_createdAt_idx" ON "ResolutionProposal"("linkedCaseId", "createdAt");

-- CreateIndex
CREATE INDEX "RecoveryDraft_linkedCaseId_idx" ON "RecoveryDraft"("linkedCaseId");

-- CreateIndex
CREATE INDEX "AuditEvent_linkedCaseId_eventTime_idx" ON "AuditEvent"("linkedCaseId", "eventTime");

-- CreateIndex
CREATE INDEX "HumanApproval_linkedCaseId_idx" ON "HumanApproval"("linkedCaseId");

-- CreateIndex
CREATE INDEX "HumanApproval_decision_idx" ON "HumanApproval"("decision");

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_linkedOrderId_fkey" FOREIGN KEY ("linkedOrderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_linkedPolicyDocumentId_fkey" FOREIGN KEY ("linkedPolicyDocumentId") REFERENCES "PolicyDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCase" ADD CONSTRAINT "CustomerCase_linkedOrderId_fkey" FOREIGN KEY ("linkedOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCase" ADD CONSTRAINT "CustomerCase_linkedShipmentId_fkey" FOREIGN KEY ("linkedShipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCase" ADD CONSTRAINT "CustomerCase_currentResolutionProposalId_fkey" FOREIGN KEY ("currentResolutionProposalId") REFERENCES "ResolutionProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_linkedCaseId_fkey" FOREIGN KEY ("linkedCaseId") REFERENCES "CustomerCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResolutionProposal" ADD CONSTRAINT "ResolutionProposal_linkedCaseId_fkey" FOREIGN KEY ("linkedCaseId") REFERENCES "CustomerCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryDraft" ADD CONSTRAINT "RecoveryDraft_linkedCaseId_fkey" FOREIGN KEY ("linkedCaseId") REFERENCES "CustomerCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_linkedCaseId_fkey" FOREIGN KEY ("linkedCaseId") REFERENCES "CustomerCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanApproval" ADD CONSTRAINT "HumanApproval_linkedCaseId_fkey" FOREIGN KEY ("linkedCaseId") REFERENCES "CustomerCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanApproval" ADD CONSTRAINT "HumanApproval_linkedResolutionProposalId_fkey" FOREIGN KEY ("linkedResolutionProposalId") REFERENCES "ResolutionProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanApproval" ADD CONSTRAINT "HumanApproval_linkedRecoveryDraftId_fkey" FOREIGN KEY ("linkedRecoveryDraftId") REFERENCES "RecoveryDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;
