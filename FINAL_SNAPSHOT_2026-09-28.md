# Final Snapshot — Claims Resolution & Recovery Hub (Luo Build, 2026-09-28)

**Status: Days 11–12 checkpoint of the 12-day Luo plan** — not necessarily the last Luo activity (trial runs through 2026-10-08), but the point-in-time snapshot this project's plan called for: last verified build, schema, API, pages, jobs, known deficiencies, and an explicit build plan for the Claude Code rebuild. If more Luo work happens before the trial ends, treat this file as superseded by whatever's newer in `Migration/` and `Testing/`, not as a final word.

This document is an index and summary. It does not duplicate detail that already lives elsewhere in this repo — it points to it.

## 1. Live build status (verified 2026-09-28)

- Build: `2c103f48-2ccb-478c-a3d4-511e117059fe` — Done / Success, no pending builds.
- Spec: `c9c03f3a-efe1-4589-b1bf-6be9bd88afc2`.
- 9 pages, 34 backend APIs, 2 scheduled jobs — full list in `Migration/migration_handoff_public_01_verified_inventory.md`, cross-checked live this week, nothing partial or orphaned.

## 2. Entity record counts (live, 2026-09-28)

| Entity | Count |
|---|---|
| Order | 6 |
| PolicyDocument | 4 |
| InsightRecord | 3 |
| Shipment | 6 |
| Rule | 4 |
| CustomerCase | 6 |
| Attachment | 3 |
| ResolutionProposal | 11 |
| RecoveryDraft | 3 |
| AuditEvent | 64 |
| HumanApproval | 14 (only 2 currently pending — down from 6 after this week's reconciliation) |

Schema, enums, and relationships: `Migration/migration_handoff_public_04_data_dictionary.md`, verified against the live DB this week — no changes needed since the 2026-09-25 inventory beyond the bug fixes in §4 below.

## 3. What actually got tested this week, and what didn't

Full detail: `Migration/migration_handoff_public_06_acceptance_tests.md` (rewritten this week from a hypothetical checklist into real, observed results) and `Testing/e2e_damaged_shipment_test_results.md` (the narrative).

**Genuinely verified live, this week, against the running app** (not just spec text): case intake + AI classification, multilingual translation, the DPD evidence gate end to end (including a fully-closed happy path: evidence → approve → proposal sent → recovery draft sent), approval gating, attachment deletion restrictions, insight recomputation, weekly report generation, Policy & Rules Admin CRUD.

**Not independently tested this week** (lower risk, but genuinely unverified, don't assume): the Orders/Shipments management *UI forms* specifically (the underlying create APIs are extremely well-tested; the actual click-through forms are not); `actionResolutionProposal`'s refusal of an unapproved proposal as a negative-path test; scheduled jobs actually firing on their cron schedule without manual triggering (only the manual-trigger code paths were exercised); data-model integrity invariants (§7 of the acceptance tests doc — every `human_approval` having exactly one linked reference, no orphaned child rows).

## 4. Known deficiencies (confirmed live status, 2026-09-28)

| # | Deficiency | Status |
|---|---|---|
| 1 | **Multi-proposal supersession** — no `current_resolution_proposal_id`, no `superseded` status, no `created_at` on ResolutionProposal/HumanApproval, `regenerateResolutionProposal` never retires prior state. Reproduces on any case's first regenerate call. | **Confirmed still unfixed.** Deliberately deferred — see `claims-resolution-hub-multiple-proposal-supersession-migration-requirement.md` for the full design and its two hard blockers (concurrency primitive unverified in Luo's spec format; no auth/role system exists at all). Two messy cases were manually reconciled as an operational workaround, not a fix — recurrence is still possible on any case. |
| 2 | Evidence `sufficient`-vs-`present` mismatch across 4 functions (one regressed silently even after the first fix, caught only by re-testing) | **Fixed live.** |
| 3 | Shipping-label evidence sufficiency structurally unreachable (uniform damage-depiction bar applied to a category that can never show damage) | **Fixed live**, category-specific criteria now in place. |
| 4 | CustomerCase.status never auto-advanced past `'new'` — no workflow function updated it except manual edit | **Fixed live**, guarded `new → awaiting_approval` auto-advance; `resolved`/`escalated`/`closed` remain intentionally manual. |

**Pattern worth designing around, not just fixing case-by-case:** three of these four bugs trace back to the same root cause — a spec claiming one function "reuses the same rules as" or "does X automatically" without that behavior actually being independently implemented/verified in every function that needed it. This recurred even *after* being found and supposedly fixed once (deficiency #2). The Claude Code rebuild should treat this as a design lesson: never let one function's behavior be defined only by reference to another's; make every function's contract explicit and test each one independently, especially anywhere multiple functions are supposed to compute "the same thing."

## 5. What to build in Claude Code — explicit plan

Ordered by what unblocks the most, not by file/entity order.

### 5.1 Data model — build the real fixes in from day one, don't port the bugs
- All 11 entities per `Migration/migration_handoff_public_04_data_dictionary.md`, but with:
  - `created_at` on every entity that needs chronological ordering (Luo was missing it on `ResolutionProposal`/`HumanApproval` — this single gap caused most of deficiency #1's damage).
  - `CustomerCase.current_resolution_proposal_id` (nullable FK) as the explicit, stored answer to "which proposal is current" — see Part B of the supersession requirement doc for the full design (business rule for what supersedes what, schema additions, API guard ordering).
  - A `superseded` status value on `ResolutionProposal`/`HumanApproval.decision`, distinct from `rejected` — never conflate "the system replaced it" with "a human rejected it."
  - Attachment `evidence_status` sufficiency criteria defined **per category** from the start (legibility + shipment info for shipping labels, damage/condition depiction for item/carton photos, legibility + relevance for other document types) — don't apply one uniform bar.
  - Real file-content-type validation on upload (sniff actual bytes, don't trust a declared/filename-derived MIME type) — this was Anomaly A in this week's testing, an easy miss otherwise.

### 5.2 Multi-proposal supersession — do it properly, not with Luo's CAS workaround
Luo's spec-generation format has no real transactions or row-locking, which is *why* the proposed fix there needed an untested compare-and-swap workaround (Part B.3/Part C of the requirement doc) that was never actually verified safe under concurrency. A real backend with a real database does not have this problem — use an actual transaction with row-level locking (e.g. `SELECT ... FOR UPDATE` in Postgres) around the read-check-supersede-write sequence in "regenerate proposal," instead of reinventing atomicity with conditional updates. This single platform difference removes Part C's hard blocker entirely.

### 5.3 Real authentication/authorization — resolves Part D's blocker
Luo had **no role/permission system at all** — every workspace member could call every API. This blocked building a safe reconciliation feature for the legacy multi-proposal cases. A real Claude Code build should have actual user accounts/roles from the start (even a minimal one), which resolves this blocker as a side effect of normal architecture rather than a special feature.

### 5.4 Core workflow — well-specified, low risk
Case intake, AI classification, multilingual translation, evidence-gated resolution proposals, human approval gating, recovery draft generation and sending. All of this is now genuinely verified end-to-end (§3 above) — implement to the acceptance-tests doc, not just the business-rules doc, since the acceptance tests carry the corrections the business-rules doc's original claims needed.

### 5.5 Admin & management screens
Policy & Rules Admin (CRUD verified working), Orders/Shipments manual entry (API verified extensively; UI-form click-through not independently verified — test this early in the rebuild since it's the one gap in an otherwise well-tested surface).

### 5.6 Reporting
Insight recomputation (verified: full-replace semantics, correct field values) and weekly report generation (verified: correct week-window math including a timezone edge case that turned out *not* to be a bug, and — worth deliberately keeping — the "timestamp unavailable" pattern for records that predate a timestamp field, rather than silently omitting or fabricating dates).

### 5.7 Explicitly do not need to reverse-engineer
The exact shape of Luo's bugs (the specific MIME-trust bypass, the specific "reuses same rules as X" phrasing that didn't propagate, the specific missing status-transition step) don't need to be ported or worked around — they're fixed at the design stage by 5.1–5.3 above. Build it right the first time rather than defensively coding around Luo-specific failure modes that won't exist in a different codebase.

## 6. Sensitive-data handling reminder for whoever picks this up

See `Migration/migration_handoff_PUBLIC_REPOSITORY_REVIEW.md` (not in this public repo — internal only) and the pattern established throughout `Migration/`: use masked case IDs (e.g. `0839…8632`) or fully synthetic fixtures, never real-looking customer names/emails/order references, in anything committed to this public repository — including this file and anything that builds on it.
