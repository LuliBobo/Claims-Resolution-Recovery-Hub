# 05 — Migration Dependencies (Internal)

## Entity dependency order (for a re-import / seed script on a target system)

Import in this order to satisfy foreign keys (VERIFIED from schema FK columns in `01`):

1. `order` (no dependencies)
2. `policy_document` (no dependencies)
3. `shipment` (needs `order`)
4. `rule` (needs `policy_document`, optional)
5. `customer_case` (needs `order`, `shipment`, both optional)
6. `attachment` (needs `customer_case`) — currently 0 rows live
7. `resolution_proposal` (needs `customer_case`)
8. `recovery_draft` (needs `customer_case`)
9. `human_approval` (needs `customer_case`, and optionally one of `resolution_proposal` /
   `recovery_draft`) — must be imported **after** both 7 and 8
10. `audit_event` (needs `customer_case`) — purely a log; safe to import last or drop if the
    target doesn't need historical audit trail
11. `insight_record` (no FK dependencies, but is a derived/rebuildable aggregate — consider
    regenerating on the target via equivalent logic instead of copying rows)

## Application-level (non-FK) dependencies

- `rule.trigger_type` ↔ `customer_case.case_type`: matched by value equality at runtime, not a DB
  constraint. A migration must preserve this matching logic, not just the enum values.
- `rule.linked_policy_document_id` policy name match: the DPD evidence-gate override in
  `internal/02` keys off `policy_document.name === "DPD Carrier Claims SOP"` (an exact string
  match embedded in the resolution-generation logic), not an ID or a flag column. Any rename of
  that policy document on the target system would silently disable the evidence gate unless the
  matching logic is also updated.
- `customer_case.resolution_recommendation` is a denormalized cache of the "latest" proposal's
  recommendation text — it is written by the create/regenerate code paths, not derived by a DB
  trigger/view. A migration target must replicate this write-through behavior explicitly if it
  wants the same field to stay in sync.

## Platform-capability dependencies (not portable via a simple DB copy)

- LLM text generation — used for translation, summarization, classification fallback, proposal
  rationale, recovery draft text. A migration target needs an equivalent generation capability;
  the exact prompts are internal to the generated backend code, not part of the spec text
  available to this inventory.
- Structured judgment engine — used for case_type/priority classification and attachment
  evidence_status judging.
- `analyze_file`-style attachment analysis — used to populate `attachment.ai_notes`.
- Knowledge Base write access — used only by `generate_weekly_report` to persist the weekly
  Markdown summary. Not required for core case-processing functionality.
- Scheduled job runner — for the two cron jobs in `01_verified_inventory.md` §2.

## Explicit non-dependencies (confirmed absent — do not carry these over as "missing integrations" to fix)

- No external e-commerce, carrier, or CRM integration is configured or referenced in the spec.
- No inbound webhook, no configured messaging integration (Slack/email/etc.), no
  knowledge-base-triggered automation exists in this build.
- GitHub integration: not configured in this workspace (0 instances) and not referenced anywhere
  in the spec — this workspace has no automated relationship to any GitHub repository today; any
  push to GitHub is a manual step outside the platform.

## Binary storage dependency (flag for migration risk assessment)

As documented in `01_verified_inventory.md` §7: the `attachment.file` reference points at
platform-managed file storage that is opaque to this inventory (no table, no inspection API
available). A migration plan must independently confirm with the platform how attachment binaries
are exported/re-hosted — this cannot be answered from the database or spec alone.
