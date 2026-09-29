# Phase 2 — Claims Resolution & Recovery Hub: Claude Code Rebuild

## Context

Over a 12-day trial, the user built and thoroughly live-tested "Claims Resolution & Recovery Hub"
(a multilingual e-commerce complaint-to-recovery workflow tool) as a prototype in the no-code
platform Luo. That prototype phase is complete: every functional flow has been verified against
the running app (not just spec text), 4 real bugs were found and 3 fixed live, and one deliberate
architectural gap — no way to track which `ResolutionProposal` is "current" when several get
generated for one case — was left unfixed because Luo's spec-generation format has no real
database transactions or row-locking, and no real authentication system at all. Both of those are
non-issues in a real backend, so this rebuild exists specifically to (a) reimplement the verified
behavior properly, and (b) solve the one thing Luo structurally couldn't.

The full verified spec, business rules, data dictionary, and the multi-proposal fix's exact
(already user-reviewed) business rule live in this repo under `Migration/` and
`claims-resolution-hub-multiple-proposal-supersession-migration-requirement.md` — this plan does
not repeat that detail, it tells the implementer where to find it and how to turn it into code.

**Decisions already made by the user**: code goes in a new `app/` subfolder of this same repo
(not a separate repo); stack is Next.js (App Router) + TypeScript + PostgreSQL via Prisma +
shadcn/ui; the actual build work runs in a Claude Code Cloud session (using ~$91 of Anthropic
Cloud credits, which expire 2026-11-04 — start this soon enough to actually use them).

## Recommended Approach

### Project structure

```
Claims Resolution & Recovery Hub/        ← existing repo root (docs untouched)
├── Migration/, Sample data/, NEW Sample Data/, Testing/, *.md   ← existing spec, unchanged
└── app/                                 ← new Next.js project root
    ├── prisma/{schema.prisma, migrations/, seed.ts}
    ├── src/
    │   ├── app/                         ← Next.js App Router: pages + route handlers ONLY
    │   │   ├── (dashboard)/{cases, cases/new, cases/[caseId], approvals,
    │   │   │                policy-rules, insights, orders, shipments,
    │   │   │                operations-summary}/page.tsx
    │   │   ├── api/{auth/[...nextauth], attachments/upload,
    │   │   │        cron/recompute-insights, cron/weekly-report}/route.ts
    │   │   └── layout.tsx
    │   ├── actions/                     ← Server Actions, thin, call into src/server
    │   ├── server/                      ← framework-agnostic domain layer (no Next imports)
    │   │   ├── db.ts, auth.ts
    │   │   ├── llm/{client.ts, translate.ts, classify.ts, generate-proposal.ts,
    │   │   │        generate-customer-reply.ts, judge-evidence.ts, prompts/}
    │   │   ├── evidence/{sufficiency-photo.ts, sufficiency-shipping-label.ts,
    │   │   │             sufficiency-document.ts, carrier-claims-gate.ts}
    │   │   ├── workflows/{case-intake.ts, regenerate-proposal.ts, action-proposal.ts,
    │   │   │              send-recovery-draft.ts, review-approval.ts}
    │   │   └── jobs/{recompute-insights.ts, weekly-report.ts}
    │   ├── lib/{file-sniff.ts, validation/}
    │   └── components/{ui/ (shadcn), features/}
    ├── tests/{unit/, integration/, e2e/}
    ├── vercel.json, .env.example, package.json
```

**Why the `src/server/*` layer exists**: both Server Actions (UI-triggered) and cron Route
Handlers (schedule-triggered) must call the *exact same* imported workflow functions — never two
places independently implementing "the same rule." This is the direct structural fix for the
recurring Luo bug class where a spec claimed one function "reuses the same rules as X" and the
generated code silently diverged.

### Prisma schema — key design points (full field lists per entity: `Migration/migration_handoff_public_01_verified_inventory.md` §1)

- All 11 entities (Order, Shipment, PolicyDocument, Rule, CustomerCase, Attachment,
  ResolutionProposal, RecoveryDraft, AuditEvent, HumanApproval, InsightRecord) plus a new `User`
  entity for auth (`role: agent | reviewer | admin`).
- Every enum in Luo's verified live schema is ported as-is (`CaseType`, `CasePriority`,
  `CaseSource`, `CaseStatus`, `AttachmentCategory`, `EvidenceStatus`,
  `RecoveryDraftStatus`/`RecoveryCounterpartyType`, `InsightTrend`, `PolicyDocumentType`,
  `RuleTriggerType`, `ShipmentDeliveryStatus`), **plus two new values that didn't exist in Luo**:
  `ProposalStatus` gains `superseded`, `ApprovalDecision` gains `superseded` — kept strictly
  distinct from `rejected` per the reviewed business rule (system-replaced vs. human-rejected are
  different facts, never conflate them).
- `ResolutionProposal` and `HumanApproval` get a real `createdAt` (Luo was missing this on both —
  the single biggest contributor to the multi-proposal mess) plus `evidenceGateApplied`/
  `supersededAt` fields so the deterministic override and the supersession event are both
  explicitly recorded, not inferred.
- `CustomerCase.currentResolutionProposalId` (nullable FK to `ResolutionProposal`) is the single
  stored source of truth for "which proposal is current" — see the supersession requirement doc's
  Part B.1/B.2 for the exact business rule (already reviewed/corrected by the user): a newly
  regenerated proposal supersedes the prior one only if it's still `pending_approval`/`approved`;
  if that proposal's `HumanApproval` already has a real decision, that approval row is **never
  modified** (only the proposal's own status moves to `superseded`); if it was still `pending`, the
  approval may move to `superseded` too. A `sent` or already-`rejected` proposal is never touched.
- `Attachment` gets `declaredContentType` (untrusted, from client) *and* `sniffedContentType`
  (detected from actual bytes) as separate fields, with a `contentTypeMismatch` flag — this
  structurally prevents Luo's Anomaly A (declared MIME silently trusted over real content).
- `HumanApproval`'s "exactly one of `linkedResolutionProposalId`/`linkedRecoveryDraftId` set,
  matching `approvalType`" invariant (verified 0 violations in Luo, workspace-wide) should be a
  real SQL `CHECK` constraint added in a follow-up raw migration, not application-code-only.

### Auth — resolves Luo's Part D blocker

NextAuth (Auth.js) v5, Credentials provider + Prisma adapter, `User.role` enum. Sized for "minimal
real roles," not enterprise IAM — no external identity provider needed, consistent with the app's
own "no external integrations" design. A `requireRole()` helper gates: approve/reject → `reviewer`
or `admin`; the new `reconcileLegacyCurrentProposal` admin action → `admin` only (this is exactly
what Luo's Part D blocker prevented from being buildable safely — having real roles from day one
resolves it as a side effect of normal architecture, not a special feature).

### Scheduled jobs

Vercel Cron (`vercel.json`) hitting two protected Route Handlers (`Authorization: Bearer
$CRON_SECRET`) that are thin wrappers around `src/server/jobs/*.ts` — the same functions must also
be callable manually (per Luo's spec: both jobs were "manual + scheduled"), so job logic must never
assume cron-only invocation. Weekly report must keep the "timestamp unavailable" labeling pattern
for any record missing a timestamp field (worth deliberately preserving — Luo got this right).

### LLM integration — keep the deterministic gate cleanly separate from the LLM (this worked well in Luo, don't regress it)

`@anthropic-ai/sdk` directly (no LangChain — 5 call types doesn't justify a framework layer), one
`callClaude()` wrapper in `src/server/llm/client.ts` with retries/timeouts, tool-use/forced JSON
output validated by zod before touching the DB. Five isolated, independently-testable modules
(translate, classify, generate-proposal, generate-customer-reply, judge-evidence) — this
isolation is the direct fix for Luo's recurring "shared logic silently diverged" bug class.

The evidence gate itself: `generate-proposal.ts` returns the LLM's own recommendation, completely
unaware any gate exists. A separate, pure, zero-LLM-dependency function
(`src/server/evidence/carrier-claims-gate.ts`) then evaluates current attachments fresh (never
cached) and, if incomplete, overwrites *only* the `recommendation` field (setting
`evidenceGateApplied = true`) — the LLM's own `rationale`/`confidence`/`customerImpact` stay
visible/auditable even when overridden, exactly matching Luo's correct behavior here.
Per-category sufficiency (`sufficiency-photo.ts` needs damage depiction; `sufficiency-shipping-
label.ts` needs legibility + tracking/carrier/address/ship-date; `sufficiency-document.ts` needs
legibility + relevance) writes to the **one** `Attachment.evidenceStatus` field that every
consumer reads — structurally preventing Luo's real bug where "present" and "sufficient" were two
different predicates in two different functions. `sendRecoveryDraft` re-runs the same gate
function before allowing `sent`, mirroring Luo's correct double-check.

### Build sequence (milestones, not a flat task list)

1. **M0 — Scaffolding**: Next.js+TS+Tailwind+shadcn/ui init under `app/`, Prisma init, local
   Postgres (Docker or a Neon/Supabase dev branch), lint/typecheck/test CI skeleton.
2. **M1 — Schema + auth foundation**: full Prisma schema + initial migration, NextAuth +
   `UserRole`, `requireRole()`, protected dashboard shell, seed script skeleton (2–3 users, one
   per role).
3. **M2 — Reference-data admin**: Orders/Shipments management, Policy & Rules admin (needed before
   case workflow, since Rules/PolicyDocuments are a dependency of proposal generation).
4. **M3 — Core case intake**: case queue/create/detail, case-create action wired to
   translate/classify (graceful degradation on LLM failure — case still creates, flagged for
   manual triage), attachment upload with real content-byte sniffing, a reusable
   `logAuditEvent()` helper adopted from here on for every mutation.
5. **M4 — Proposal generation + evidence gate**: `generate-proposal.ts`, the 3 sufficiency
   modules, `carrier-claims-gate.ts` as a fixture-driven unit-tested pure function, first
   `HumanApproval` creation, guarded `new → awaiting_approval` auto-advance (re-verify this
   actually fires — Luo's own docs record this being aspirational-only for a long time).
6. **M5 — Approval + send gating**: Approvals Queue, approve/reject action, mark-sent action
   (gated on `approved`), RecoveryDraft generation + its own approval + independent evidence
   re-check before `sent`.
7. **M6 — Current-proposal-pointer feature (the hard part)**: `currentResolutionProposalId` +
   backfill rule (auto-backfill only when exactly one non-terminal candidate exists; leave `NULL`
   and hard-block sending for genuinely ambiguous cases — never silently pick one), regenerate
   logic rewritten around a Prisma `$transaction` with `SELECT ... FOR UPDATE` on the
   `CustomerCase` row (this is the concrete platform difference that removes Luo's unresolved
   concurrency blocker), supersede semantics exactly per the reviewed business rule, mark-sent
   guard order (`status==='superseded'` → reject; `id !== currentResolutionProposalId` → reject;
   then existing approval check), `reconcileLegacyCurrentProposal` admin action (role-gated).
   UI: "Current"/"Superseded" badges, Approvals Queue excludes `decision='superseded'`.
   **Gate**: a dedicated integration test firing two concurrent regenerate/action calls against a
   real test DB must pass before this milestone is considered done — Luo explicitly flagged this
   exact concurrency behavior as unverified and a stop condition on failure; don't inherit that
   uncertainty here without actually testing it.
8. **M7 — Insights + reporting jobs**: nightly recompute (delete-all + bulk-insert in one
   transaction, matching Luo's verified "fully replaces prior set" semantics), weekly report with
   timestamp-unavailable labeling, Insights dashboard, Operations Summary KPI dashboard (scoped to
   `status not in (resolved, closed)`), Vercel Cron wiring.
9. **M8 — Seed data, polish, deploy**: seed script (see below), UI polish, an E2E smoke test of
   the full happy path (case → proposal → evidence gate → approval → send → recovery draft →
   send — mirroring Luo's own first fully-closed happy path), Vercel deployment.

### Seed-data strategy

`Sample data/`/`NEW Sample Data/` cover 9 of 11 entities but need translation, not a direct load:
no `PolicyDocument`/`Rule` data exists in either CSV package — hardcode ~3 policies/3 rules in
`seed.ts` matching Luo's verified live counts (`migration_handoff_public_01_verified_inventory.md`
§4), including the exact-named carrier-claims SOP the evidence gate matches against. The CSVs use
an older field vocabulary than the verified live schema (e.g. `damaged_item_photo` vs. the real
`photo_evidence`) — needs an explicit mapping, not a 1:1 copy; cross-reference `Sample
data/data_dictionary.md` against `Migration/migration_handoff_public_04_data_dictionary.md`.
**Don't hand-load `resolution_proposals.csv`/`recovery_drafts.csv`/`human_approvals.csv`/
`audit_events.csv`** — those are explicitly reference fixtures, not import-ready, and predate
fields this rebuild requires (`createdAt`, `customerReplyDraft`, the current-proposal pointer).
Instead, seed `Order`/`Shipment`/`CustomerCase`/`Attachment` from the CSVs, then drive proposals/
approvals/recovery drafts/audit events **through the real workflow functions programmatically** so
seeded data always has correct shape and exercises real code paths. Respect `Sample
data/import_order.md`'s dependency ordering (Orders → Shipments → CustomerCases → Attachments).

## Critical Files

- `app/prisma/schema.prisma` — the schema design above, especially the current-proposal pointer
  and the two new enum values.
- `app/src/server/workflows/regenerate-proposal.ts` — the transaction/row-lock supersession logic;
  the single most important file in this rebuild.
- `app/src/server/evidence/carrier-claims-gate.ts` — must stay a pure, zero-LLM-dependency
  function, called from both `case-intake.ts` and `regenerate-proposal.ts`, never duplicated.
- `app/src/server/llm/client.ts` — the one place Anthropic API calls happen.
- `app/src/server/auth.ts` — `requireRole()`, used by every mutating action/workflow.
- `Migration/migration_handoff_public_01_verified_inventory.md`,
  `_02_business_rules_and_workflows.md`, `_04_data_dictionary.md`,
  `claims-resolution-hub-multiple-proposal-supersession-migration-requirement.md` — the source
  spec this whole rebuild implements; read before writing any workflow code, not just schema.

## Verification

- **Unit tests** (`app/tests/unit/`): the 3 evidence-sufficiency modules and
  `carrier-claims-gate.ts` against fixture inputs (sufficient/insufficient per category, gate
  fires/doesn't) — these are pure functions, cheap to test exhaustively.
- **Integration test, hard gate for M6**: two concurrent `regenerateResolutionProposal` calls
  against a real test database must resolve to exactly one `current_resolution_proposal_id` with
  no case left with two live (non-superseded, non-terminal) proposals. This is the one thing Luo
  could never verify — it must pass here before the feature is considered done.
- **E2E smoke test** (M8): the full happy path end to end, mirroring
  `Testing/e2e_damaged_shipment_test_results.md` — case creation → evidence upload → evidence gate
  clears → both approvals → resolution proposal sent → recovery draft sent. Compare actual output
  against the acceptance criteria in `Migration/migration_handoff_public_06_acceptance_tests.md`,
  which already carries Luo's real observed results as the baseline to match or exceed.
- **Manual walkthrough**: `npm run dev`, log in as each seeded role, click through all 9 pages
  once each, confirm the Case Detail page shows a "Current" badge correctly and rejected/
  superseded approvals render distinctly in the Approvals Queue.
