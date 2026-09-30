-- AuditEvent is append-only: rows can never be updated, and can only be deleted as part of
-- the ON DELETE CASCADE from their CustomerCase (the parent row is already gone at that point).
CREATE FUNCTION audit_event_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'AuditEvent rows are append-only';
  END IF;
  IF TG_OP = 'DELETE' AND EXISTS (SELECT 1 FROM "CustomerCase" WHERE id = OLD."linkedCaseId") THEN
    RAISE EXCEPTION 'AuditEvent rows are append-only';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_event_no_update_delete
  BEFORE UPDATE OR DELETE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION audit_event_guard();
