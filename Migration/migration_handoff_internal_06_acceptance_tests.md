# 06 — Acceptance Tests (Internal)

These are **behavioral checks derived from verified rules/workflows** (`internal/02`), for the
migration target to validate against. None of these were executed against production data as part
of this task (no writes, sends, approvals, or regenerations were performed here) — they are
written as a checklist for the migration team to run themselves, using disposable test data.

## 1. Case intake & auto-triage
- [ ] Creating a case in a non-English language populates `internal_english_summary` via
      translation, distinct from the original `complaint_text`.
- [ ] Omitting `case_type`/`priority` on create causes the system to classify them automatically
      rather than leaving them null.
- [ ] Creating a `damaged_delivery` case matching an active Rule produces exactly one new
      `ResolutionProposal` (`status = pending_approval`) and exactly one new `HumanApproval`
      (`approval_type = resolution_proposal`, `decision = pending`) referencing it.
- [ ] If the generated proposal implies recovery is possible, exactly one `RecoveryDraft`
      (`status = pending_approval` or `draft`, per spec) is also created with its own
      `HumanApproval`.
- [ ] Case `status` becomes `awaiting_approval` once generation completes, and an `AuditEvent` is
      recorded for case creation and for status change.

## 2. DPD Carrier Claims SOP evidence gate
- [ ] For a `damaged_delivery` case with **no** evidence attachments and an active DPD SOP rule,
      the Resolution Proposal's recommendation is exactly `"Request Missing Evidence"`.
- [ ] Uploading all 3 required evidence photos (shipping label, damaged item, outer carton) and
      re-reading the case via `get_customer_case` flips `evidence_complete` to `true` and updates
      the live-computed booleans, without requiring a new proposal to be manually regenerated.
- [ ] With `evidence_complete = false`, calling `send_recovery_draft` on an *approved* draft is
      **refused** with an evidence-related error, even though approval alone would otherwise allow
      sending.
- [ ] Deleting an evidence attachment flips `evidence_complete` back to `false` on next read (no
      caching of the stale "complete" state).

## 3. Approval gating
- [ ] `action_resolution_proposal` refuses to mark a proposal `sent` while its status is
      `pending_approval` or `rejected` — succeeds only when `approved`.
- [ ] `send_recovery_draft` refuses to mark a draft `sent` while `pending_approval` or `rejected`,
      and (per #2) also refuses if DPD evidence is incomplete even when `approved`.
- [ ] `review_approval` approving a `resolution_proposal`-type approval updates the linked
      proposal's `status` to `approved`; rejecting sets it to `rejected`. Same pattern verified
      for `recovery_draft`-type approvals against the linked draft, with `approved_at` stamped on
      approval.

## 4. Attachment deletion restriction (`delete_attachment`)
- [ ] Attempting to delete an attachment whose `file_name` does **not** start with `test_` or
      `synthetic_`, and whose id is not the hardcoded exception UUID, is refused.
- [ ] Attachments named with a `test_` or `synthetic_` prefix can be deleted.
- [ ] Confirm whether the one-time hardcoded exception UUID
      (`3ab6bf6c-02ed-4275-a422-57dbe51894b6`) should be removed from the migration target's
      equivalent logic — it was a one-off cleanup mechanism for this workspace's own accidental
      test data, not a general-purpose rule, and porting it verbatim would carry over a dead
      special case tied to an ID meaningless on a new system.
- [ ] Deleting an attachment does not modify any other entity (case, proposal, draft, approval,
      audit event) — single-row delete only.
- [ ] **Cannot be checked from this workspace**: whether the underlying binary is purged from file
      storage on delete (see `01_verified_inventory.md` §7) — the migration target should verify
      this independently for whatever storage backend it uses.

## 5. Insights & reporting
- [ ] `recompute_insights` fully replaces the `InsightRecord` set from currently `resolved`/
      `escalated` cases (no stale rows left from a previous run).
- [ ] The nightly and weekly scheduled jobs run at the specified cron schedule/timezone and invoke
      the correct backend function without requiring manual triggering.
- [ ] `generate_weekly_report` writes to the Knowledge Base and does not error if there is no
      activity in the given week (empty-but-valid report).

## 6. Data model integrity
- [ ] Every `human_approval` row has exactly one of `linked_resolution_proposal_id` /
      `linked_recovery_draft_id` set (consistent with `approval_type`), never both, never neither.
- [ ] No orphaned `attachment`, `resolution_proposal`, `recovery_draft`, `human_approval`, or
      `audit_event` row exists without a valid `linked_case_id` pointing to an existing case.
