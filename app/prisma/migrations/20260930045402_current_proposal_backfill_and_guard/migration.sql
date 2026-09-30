-- 1. Backfill the current-proposal pointer, but only where it is not a choice: a case with
--    exactly one non-terminal (pending_approval / approved) proposal. Cases with two or more
--    stay NULL and are hard-blocked from sending until an admin reconciles them.
UPDATE "CustomerCase" c
SET "currentResolutionProposalId" = p.id
FROM (
  SELECT "linkedCaseId", (array_agg(id))[1] AS id, count(*) AS n
  FROM "ResolutionProposal"
  WHERE status IN ('pending_approval', 'approved')
  GROUP BY "linkedCaseId"
) p
WHERE p."linkedCaseId" = c.id AND p.n = 1 AND c."currentResolutionProposalId" IS NULL;

-- 2. A case's current pointer may only reference one of its own proposals.
CREATE FUNCTION customer_case_pointer_guard() RETURNS trigger AS $$
BEGIN
  IF NEW."currentResolutionProposalId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "ResolutionProposal"
    WHERE id = NEW."currentResolutionProposalId" AND "linkedCaseId" = NEW.id
  ) THEN
    RAISE EXCEPTION 'currentResolutionProposalId must reference a proposal of the same case';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customer_case_pointer_same_case
  BEFORE INSERT OR UPDATE OF "currentResolutionProposalId" ON "CustomerCase"
  FOR EACH ROW EXECUTE FUNCTION customer_case_pointer_guard();
