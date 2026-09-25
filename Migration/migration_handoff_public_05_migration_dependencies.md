# 05 — Migration Dependencies (Public)

## Entity dependency order (for a re-import/seed script on a target system)

1. Order (no dependencies)
2. PolicyDocument (no dependencies)
3. Shipment (needs Order)
4. Rule (needs PolicyDocument, optional)
5. CustomerCase (needs Order, Shipment, both optional)
6. Attachment (needs CustomerCase)
7. ResolutionProposal (needs CustomerCase)
8. RecoveryDraft (needs CustomerCase)
9. HumanApproval (needs CustomerCase, and optionally one of ResolutionProposal/RecoveryDraft) —
   import after both 7 and 8
10. AuditEvent (needs CustomerCase) — a log; safe to import last or drop if not needed downstream
11. InsightRecord — a derived/rebuildable aggregate; consider regenerating on the target via
    equivalent logic instead of copying rows

## Application-level (non-FK) dependencies

- Rule-to-case matching is by value equality on a type field at runtime, not a database
  constraint — this matching logic must be preserved, not just the enum values.
- The evidence-gate override keys off an exact policy-document name string embedded in the
  generation logic, not an ID or dedicated flag. Renaming that document on the target would
  silently disable the gate unless matching logic is updated too.
- The case-level "latest recommendation" field is a denormalized cache written by the
  create/regenerate code paths, not derived by a database trigger or view — a migration target
  must replicate this write-through behavior explicitly if it wants the field to stay in sync.

## Platform-capability dependencies (not portable via a simple database copy)

- LLM text generation (translation, summarization, classification fallback, proposal rationale,
  recovery-draft text) — a target needs an equivalent generation capability; exact prompts are
  internal to generated code, not part of this inventory.
- A structured judgment engine for classification and evidence-sufficiency judging.
- File-analysis on attachment upload.
- Knowledge Base write access, used only for weekly report output — not required for core
  case-processing.
- A scheduled-job runner for the two cron jobs (nightly recompute, weekly report).

## Explicit non-dependencies (confirmed absent — not a gap to "fix")

- No external e-commerce, carrier, or CRM integration is configured or referenced anywhere.
- No inbound webhook, no configured messaging integration, no knowledge-base-triggered automation.
- No GitHub integration is configured in this workspace, and the spec never references GitHub —
  there is no automated relationship between this workspace and any GitHub repository; publishing
  is a manual step outside the platform.

## Binary storage — flag for migration risk assessment

Attachment records reference platform-managed file storage that is opaque to this inventory (no
inspectable table or API). A migration plan must independently confirm with the platform how
attachment binaries are exported/re-hosted — this cannot be answered from the database or spec
alone.
