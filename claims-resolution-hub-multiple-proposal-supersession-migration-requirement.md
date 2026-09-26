# Multiple Resolution Proposals / Stale Approval — Migration Implementation Requirement

**Status: PLANNING ONLY** — nothing in this document has been built. No spec edits, schema changes, data writes, approvals, sends, or builds have been performed as part of this investigation. This document exists to hand off a fully-scoped requirement to whoever implements it next (including a coding agent). Treat every item under "Proposed Design (Unbuilt)" as a design to be validated, not a description of current behaviour.

## Part A — Verified Current Behaviour (as of this writing, live build)

Confirmed by direct read-only inspection (`query_spec`, SELECT-only SQL) of the Claims Resolution & Recovery Hub feature set.

### Data model

- `resolution_proposal`: `id` (uuid), `linked_case_id`, `recommendation`, `rationale`, `confidence`, `customer_impact`, `business_exposure`, `policy_source`, `status` (enum: `pending_approval | approved | rejected | sent`), `needs_human_approval`. No `created_at`, no sequence field, no "is current" flag.
- `human_approval`: `id` (uuid), `linked_case_id`, `approval_type` (enum: `resolution_proposal | recovery_draft`), `linked_resolution_proposal_id`, `linked_recovery_draft_id`, `reviewer`, `decision` (enum: `pending | approved | rejected`), `reviewer_comment`, `decision_time`. No `created_at`, no sequence field.
- `customer_case.resolution_recommendation` is a denormalized text field, not a reliable pointer to "the current proposal" (see real example below).

### No formal ordering or "current" concept exists

- `getCustomerCase` returns `resolutionProposals`/`humanApprovals` arrays with no specified sort order (unlike `auditEvents`, which is explicitly ordered by event time).
- No `is_current`/`is_latest` field or status value marks a proposal as "the active one." The spec uses informal phrases ("immediately prior Resolution Proposal," "most recent Resolution Proposal") in `regenerateResolutionProposal` and `sendRecoveryDraft`, but defines no deterministic rule or persisted field to resolve them.
- The Case Detail page (`case_detail_proposals` component) renders all proposals identically — no "Current" badge, no distinguishing sort.

### Regeneration does not retire prior state

- `regenerateResolutionProposal(caseId)` always creates a new Resolution Proposal + linked Human Approval (`decision='pending'`). It never updates or invalidates a prior proposal or its approval.
- Prior pending Human Approvals are left dangling — still `decision='pending'`, still linked to a now-superseded proposal, indefinitely.

### Real example found in this workspace (masked case id `0839…8632`)

- Status: `awaiting_approval`. 4 Resolution Proposals, all `status='pending_approval'`, each with its own pending Human Approval (plus 1 pending recovery-draft approval — 5 pending approvals total on this one case).
- The case's denormalized `resolution_recommendation` field matched 2 of the 4 proposals equally (a tie) — it cannot uniquely identify "the" current proposal.
- Workspace-wide: 4 cases, 7 proposals, 9 human approvals, 6 pending. This is the only multi-proposal case.
- This case has not been modified, reconciled, or acted on by anything in this investigation and must not be, until a separate explicit decision authorizes it (see Part D).

### Action/approval lookup mechanics (this part is sound)

`reviewApproval(approvalId)` and `actionResolutionProposal(resolutionProposalId)` both resolve strictly by direct foreign key (approval → its own linked proposal/draft), never by a case-level "find the latest" query. A given call cannot be misrouted to the wrong record by id. The risk is entirely that a human (or the UI) hands it the id of a stale/superseded record because nothing marks it as such.

### Platform capability facts relevant to any fix (verified via `query_spec`)

- No declarative unique-index or check-constraint mechanism exists in this spec format — invariants like "at most one active proposal per case" can only be described in prose, never enforced declaratively.
- No documented transaction-wrapping or row-locking primitive (no `SELECT ... FOR UPDATE`, no advisory locks) is expressible in this spec format or confirmed present in the runtime.
- No DB serial/auto-increment/identity field type exists in the spec's type system (only UUID/string/text/integer/decimal/float/boolean/date/datetime/file_ref) — a monotonic sequence number cannot be obtained as an engine-guaranteed atomic counter through the spec.
- No delete API exists for `CustomerCase`, `ResolutionProposal`, or `HumanApproval` — `deleteAttachment` is the only delete-capable API in the entire spec, and it's scoped to Attachment records with a `test_`/`synthetic_` filename guard. Any real rows created in these entities (e.g. for testing) are permanent.
- No role/permission/authenticated-user-identity system exists anywhere in this workspace. The spec explicitly states: "No differentiated user roles requested; all workspace members can access all pages and APIs." Fields like `reviewer`/`assigned_reviewer` are caller-supplied free text, not verified identity.
- `getOperationsSummary` determines "open" cases purely by `status not in (resolved, closed)`; `generateWeeklyReport` counts a case as "opened" if `created_at` falls in the report week, and as "resolved" by `resolved_at` — independent of any of the above.

## Part B — Proposed Design (Unbuilt — requires validation before implementation)

### B.1 Business rule (as corrected in review)

- A newly regenerated proposal supersedes the case's previously-current proposal only if that prior proposal is still in status `pending_approval` or `approved` (i.e. not yet sent, not already rejected).
- If the prior proposal's Human Approval already recorded a real human decision (`approved` or `rejected`), that `HumanApproval` row is **never modified** — `decision`, `reviewer`, `reviewer_comment`, `decision_time` remain exactly as recorded, permanently. Only the proposal's own `status` moves to a new value, `superseded` (never `rejected` — these are different business facts and must never be conflated).
- If the prior proposal's Human Approval was still `pending` (no human decision ever made), that approval record's `decision` may move to `superseded` too — nothing historical is erased because nothing was ever decided.
- A proposal already `sent` is never touched by anything. A proposal already `rejected` is already terminal and is also never touched.

### B.2 Explicit source of truth

- Add `customer_case.current_resolution_proposal_id` (nullable FK to `resolution_proposal`) as the single, explicit, stored answer to "which proposal is current for this case" — not a computed/inferred value.
- `regenerateResolutionProposal` and `sendRecoveryDraft`'s "most recent proposal" language is rewritten to mean, precisely: `case.current_resolution_proposal_id`.

### B.3 Concurrency mechanism (unverified — see Part C)

Because no locking/transaction primitive is confirmed available, the design avoids needing one: every state transition is expressed as a single conditional UPDATE, relying on ordinary single-statement atomicity rather than explicit locks:

- **Pointer swap:** `UPDATE customer_case SET current_resolution_proposal_id = :new WHERE id = :caseId AND current_resolution_proposal_id IS NOT DISTINCT FROM :expectedOld` (note: `IS NOT DISTINCT FROM`, not `=`, so the NULL-origin case is handled correctly — `NULL = NULL` is `UNKNOWN` in SQL, not `TRUE`).
- **Supersede:** `UPDATE resolution_proposal SET status='superseded' WHERE id = :oldId AND status IN ('pending_approval','approved')`.
- **Send:** `UPDATE resolution_proposal SET status='sent' WHERE id = :id AND status='approved'`.
- Send and Supersede compete for the same row on the same precondition (`status='approved'`); only one can ever succeed, closing the race between `actionResolutionProposal` and a concurrent `regenerateResolutionProposal` without any additional locking.
- Whichever caller's conditional UPDATE affects 0 rows has "lost" and must not treat its own newly-created proposal/approval as current; it must actively mark its own new rows superseded (via the same conditional-update discipline) and write a clarifying Audit Event — it must not just abandon them, because an un-cleaned-up loser row is visible in Case Detail, the Approvals Queue, and `getOperationsSummary`'s pending counts.

### B.4 Schema additions (all additive/nullable — no destructive changes)

- `CustomerCase.current_resolution_proposal_id: ResolutionProposal | null` (new)
- `ResolutionProposal.status` enum: add `'superseded'`
- `ResolutionProposal.created_at`, `HumanApproval.created_at`: new, for display ordering only (not authoritative — correctness never depends on these)
- `HumanApproval.decision` enum: add `'superseded'`
- `HumanApproval.superseded_at`: new, nullable — kept distinct from `decision_time` (which stays reserved for real human decisions)
- No schema change to `AuditEvent`; new conventional action values: `resolution_proposal_superseded`, `resolution_proposal_manually_reconciled`.

### B.5 API changes (proposed)

- `regenerateResolutionProposal`: create new proposal+approval → attempt pointer CAS → on success, conditionally supersede the old proposal (and its approval only if still pending) → write supersede Audit Event. On CAS failure, mark own new rows superseded and report conflict.
- `actionResolutionProposal`: guard order — (1) reject if `proposal.status === 'superseded'`, distinct error message; (2) reject if `proposal.id !== case.current_resolution_proposal_id` (defense in depth for partial-failure windows); (3) existing approval-decision check; (4) perform the send as the conditional UPDATE in B.3, not a separate read-then-write.
- `sendRecoveryDraft`: policy-source lookup reads `case.current_resolution_proposal_id` directly instead of an undefined "most recent" query.
- `reviewApproval`: add a distinct error message when `approval.decision === 'superseded'` (currently would just fall into the generic "not pending" error).
- New, narrowly-scoped admin API `reconcileLegacyCurrentProposal(caseId, resolutionProposalId, reviewer, reviewerComment)` — see Part D for its unresolved authorization gap.

### B.6 Legacy/ambiguous-case rule

- If a case has zero or one proposal in a non-terminal status (`pending_approval`/`approved`), backfilling `current_resolution_proposal_id` to that single candidate is not a "choice" (only one candidate exists) and may be automatic.
- If a case has two or more non-terminal proposals (e.g. the real 4-proposal case in this workspace), `current_resolution_proposal_id` stays `NULL` permanently until a human explicitly reconciles it via the new API. While `NULL` with multiple non-terminal candidates, `actionResolutionProposal` and approval-gated sending are hard-blocked for that case — not just discouraged in the UI.

### B.7 UI changes (proposed)

- "Current" badge on the proposal matching `current_resolution_proposal_id`; "Superseded" label on others, derived by reading proposal status together with its (untouched) linked approval's decision — e.g. "Superseded — approved by {reviewer} on {decision_time}, replaced before being sent" vs. "Superseded — no decision was recorded before it was replaced."
- Approvals Queue excludes `decision='superseded'` from the default pending view.
- A banner/report for cases needing manual reconciliation.

## Part C — Unresolved Concurrency Risk (hard blocker — not yet verified)

The conditional-UPDATE (CAS) primitive in B.3 is not confirmed to work as described. The spec format has no documented transaction or locking semantics; whether the generated backend issues a true single atomic statement (vs. a read-then-branch-then-write sequence that would reintroduce the race) and exposes an affected-row/success signal is unknown and can only be established by building an isolated test and observing real concurrent behaviour.

This has not been tested. No scratch entities, no test API, and no builds have been created for this purpose, per explicit instruction.

Proposed (not executed) verification approach: two throwaway scratch entities with zero relation to production data (`ConcurrencyTestParent` with a nullable pointer field, `ConcurrencyTestChild`) plus one minimal test-only API implementing exactly the `IS NOT DISTINCT FROM` conditional update, fire two concurrent calls, inspect results read-only, then remove the scratch entities entirely (dropping the table) so no production table or permanent row is ever touched. This has not been approved or run.

**Hard requirement carried forward:** if this primitive cannot be verified to prevent two proposals from both becoming "current," the feature must not ship with a documented race window as an accepted fallback. A failed verification is a stop condition requiring re-design, not a shippable compromise.

Partial-failure behavior (process dies mid-sequence) is also unverified: the spec documents no transaction/rollback semantics for any multi-step API today (this is a pre-existing gap, not new). Worst-case analysis: an orphaned non-current proposal/approval could persist without a superseding write ever running; a read-only detection query ("non-terminal proposals/approvals whose case's current pointer doesn't reference them") is proposed as an operational safety net, not yet built.

## Part D — Unresolved Authorization Risk (hard blocker — not yet decided)

This workspace has no role/permission system at all (confirmed, see Part A). "Require a reviewer name and comment" on the proposed `reconcileLegacyCurrentProposal` API is not real authorization — any workspace member can call any API today, and nothing distinguishes an authorized reconciler from anyone else.

Two options were presented, neither yet decided:
(a) Accept the reconciliation API stays open to all workspace members, consistent with everything else in this workspace, as a documented/accepted limitation; or
(b) Introduce a real identity/role layer first (e.g. configuring the Clerk integration) — separate, larger scope.

No decision has been made. Do not build the reconciliation API against either assumption without this being resolved explicitly first.

## Part E — Legacy Case Handling (explicit instruction)

The real 4-proposal case found in this workspace (masked id `0839…8632`) must not be modified, reconciled, or have any proposal/approval status changed by this work, now or as part of any future "cleanup," until a separate, explicit decision authorizes touching it. It remains exactly as originally observed: 4 proposals (`status='pending_approval'`), 5 pending Human Approvals.

Do not silently choose or default a "current" proposal for this or any similarly ambiguous case. Ambiguous means: stop and ask, don't infer from row order, IDs, or denormalized text-match ties (the denormalized `resolution_recommendation` field was found to tie between 2 of the 4 proposals and is not usable as a tiebreaker).

## Part F — Test/Cleanup Constraint

No delete API exists for `CustomerCase`, `ResolutionProposal`, or `HumanApproval`. Any concurrency verification or feature testing performed against these real entities would leave permanent, undeletable rows (visible in Case Queue, Approvals Queue, Operations Summary, and Weekly Report). Verification must use disposable scratch entities that can be fully removed from the spec afterward (dropping the whole table), not disposable rows in production entities.

## Summary for the implementer

Everything in Part A is verified, current, live behaviour. Everything in Part B is an unbuilt proposal requiring explicit approval before any spec edit. Parts C and D are hard blockers — do not implement the concurrency mechanism or the reconciliation API until each is separately resolved (C: empirically verified via an isolated, zero-footprint spike; D: an explicit authorization decision). Part E is a standing constraint, not a to-do: the existing four-proposal case stays untouched until someone explicitly authorizes acting on it.
