# 06 — Acceptance Tests (Public)

Behavioral checks derived from the verified rules/workflows in `02_business_rules_and_workflows.md`,
for the migration target to validate against using disposable test data. None of these were
executed against production data as part of producing this inventory — this is a review-time
checklist only.

## 1. Case intake & auto-triage
- [ ] Non-English complaint text produces a translated/summarized internal English field distinct
      from the original.
- [ ] Omitting case type/priority triggers automatic classification instead of leaving them null.
- [ ] Creating a damaged-delivery case matching an active rule produces exactly one new resolution
      proposal (pending approval) and exactly one new human approval referencing it.
- [ ] A proposal implying recoverable value also produces a recovery draft with its own pending
      approval.
- [ ] Case status becomes "awaiting approval" once generation completes, with audit events logged
      for creation and status change.

## 2. Deterministic evidence gate
- [ ] A damaged-delivery case with no evidence attachments, matched to the applicable carrier
      claims SOP, produces the fixed "request missing evidence" recommendation.
- [ ] Uploading all three required evidence types and re-reading the case flips completeness to
      true without needing manual regeneration.
- [ ] With evidence incomplete, the mark-as-sent action for an *approved* recovery draft is
      refused with an evidence-related error.
- [ ] Removing an evidence attachment flips completeness back to false on the next read (no stale
      caching of a previously "complete" state).

## 3. Approval gating
- [ ] Mark-as-sent for a resolution proposal is refused unless its status is approved.
- [ ] Mark-as-sent for a recovery draft is refused unless approved, and (per §2) also refused if
      evidence is incomplete even when approved.
- [ ] Approving/rejecting a proposal-type or draft-type approval updates the linked record's
      status accordingly, stamping the approval timestamp only on approval.

## 4. Attachment deletion restriction
- [ ] Deleting an attachment whose file name lacks a designated test/synthetic prefix is refused.
- [ ] Attachments with the designated prefix can be deleted.
- [ ] Confirm whether any one-off hardcoded exception ID inherited from the source system's own
      cleanup history should be dropped rather than ported — it is not a general-purpose rule.
- [ ] Deleting an attachment modifies no other entity — single-row delete only.
- [ ] **Cannot be checked from schema/spec alone**: whether the underlying binary is purged from
      file storage on delete — verify independently against whatever storage backend the target
      uses.

## 5. Insights & reporting
- [ ] Insight recomputation fully replaces the previous aggregate set (no stale leftover rows).
- [ ] Scheduled jobs run at their specified cadence without needing manual triggering.
- [ ] Weekly report generation succeeds even for a week with no activity (empty-but-valid report).

## 6. Data model integrity
- [ ] Every human approval has exactly one of its two possible linked-record references set,
      consistent with its declared approval type — never both, never neither.
- [ ] No orphaned attachment, proposal, draft, approval, or audit record exists without a valid
      parent case reference.
