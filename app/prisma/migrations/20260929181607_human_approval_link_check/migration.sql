-- Exactly one of the two link columns is set, and it must match approval_type.
-- (Verified 0 violations in the Luo prototype, workspace-wide.)
ALTER TABLE "HumanApproval"
  ADD CONSTRAINT "HumanApproval_link_matches_type_check" CHECK (
    ("approvalType" = 'resolution_proposal'
       AND "linkedResolutionProposalId" IS NOT NULL
       AND "linkedRecoveryDraftId" IS NULL)
    OR
    ("approvalType" = 'recovery_draft'
       AND "linkedRecoveryDraftId" IS NOT NULL
       AND "linkedResolutionProposalId" IS NULL)
  );
