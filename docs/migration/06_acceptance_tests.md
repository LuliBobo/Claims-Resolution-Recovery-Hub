# 06 — Acceptance tests for a rebuilt application

Checklist for disposable synthetic fixtures. **Unchecked items are proposed tests, not tests already passed.** Source: supplied Luo migration inventory (2026-09-25) and a later Luo report on attachment-deletion guard changes.

## Case intake

- [ ] A manually entered non-English complaint retains its original text and receives a separate internal English summary.
- [ ] Missing case type or priority is classified according to the target's documented rule.
- [ ] A matched active Rule/PolicyDocument produces a proposal and the appropriate pending approval(s), without unintended duplicates.
- [ ] Cases and approvals remain correctly linked; case status transitions are auditable.

## Evidence and claims

- [ ] Applicable DPD damaged-delivery case without required photographs returns `Request Missing Evidence`, lists all three items as missing, and never says the claim is ready to send.
- [ ] Three correctly recognised and sufficient photographs make transient evidence completeness true; an incomplete or insufficient photo does not.
- [ ] Complete evidence alone does not enable Send Draft while the draft is `pending_approval`.
- [ ] Both complete evidence and an `approved` RecoveryDraft enable the existing mark-as-sent path; lack of either condition blocks it in both UI and backend.
- [ ] Removing a test photograph resets completeness on the next read; proposal text is checked again after regeneration.
- [ ] Only material recommendation/evidence changes create one proposal-update audit event; wording-only changes create none.
- [ ] Cases outside the applicable DPD rule do not inherit its three-photo gate.
- [ ] Repeated regeneration is inspected for additional proposal/approval rows; do not assume the source's existing duplicates are resolved.

## Approval, storage and deletion

- [ ] Proposal/draft mark-as-sent refuses unapproved records. A `sent` status does not imply actual email or carrier submission unless a separate outbound integration is built and tested.
- [ ] Approval references exactly the record and case being reviewed; reject inconsistent links.
- [ ] Test Attachment deletion rejects names without the case-sensitive `test_` or `synthetic_` prefix; it accepts matching names only for suitably authorised callers.
- [ ] No legacy one-off UUID exception exists in the target implementation. Verify that deletion does not unintentionally cascade.
- [ ] Test and document whether database-row deletion also removes binary storage; source behaviour is unverified. Decide on appropriate audit and retention policy in the target.

## Reporting and integrity

- [ ] Scheduled InsightRecord recomputation follows documented aggregation rules and does not accumulate stale aggregate rows.
- [ ] Weekly reporting yields a valid output even with no activity; risk ranking uses case count then estimated recoverable value as a tie-breaker.
- [ ] Source-to-target ID mappings preserve Order→Shipment→CustomerCase and all case child links.
- [ ] Exported audit history remains intact and reviewable; any derived aggregate can be independently recomputed.
- [ ] Run a final public-content review: no personal records, credentials, raw case text, or internal sensitivity reports are committed.
