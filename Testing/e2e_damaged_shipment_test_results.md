# E2E Test Results — Damaged-Delivery Complaint (executed 2026-09-26/27)

Companion to [e2e_damaged_shipment_test_scenario.md](e2e_damaged_shipment_test_scenario.md) (the
plan). This is what actually happened when it was run live in Luo, against a fresh synthetic case
(`95382638-8a8f-42eb-8f12-5f72fa24b24b`, "QA E2E Test Customer" — no real customer data).

## Result against the original acceptance checklist

| Step | Result |
|---|---|
| Precondition: DPD Carrier Claims SOP policy/rule active | ✅ Confirmed present |
| Order, Shipment, Case created | ✅ |
| AI classified `caseType`/`priority` | ✅ (`damaged_delivery`, `low`) |
| Proposal forced to "Request Missing Evidence" with 0 evidence | ✅ |
| 3 evidence attachments uploaded | ✅ (took several attempts — see Lessons below) |
| Evidence booleans flip on re-read | ✅ (once evidence_status genuinely reached `sufficient`) |
| Displayed recommendation updates only via explicit regenerate, not passive read | ✅ Confirmed |
| Send-before-approval correctly refused | ✅ |
| Both approvals succeed | ✅ |
| `actionResolutionProposal` succeeds once approved | ✅ |
| `sendRecoveryDraft` succeeds once evidence complete + approved | ✅ Succeeded 2026-09-28T04:17:03Z, after the Bug #3 fix |

**Full happy path demonstrated, 2026-09-28.** Case → evidence → approve → resolution proposal
sent → recovery draft sent, end to end, for the first time in this workspace. Three real bugs were
found along the way (two fixed live, one deliberately deferred) — see below. See
`Migration/migration_handoff_public_02_business_rules_and_workflows.md` for the corrected
canonical business-rule description these findings feed into.

## Bugs found

1. **Multiple-proposal supersession** — reproduced on this case too (see the addendum in
   `claims-resolution-hub-multiple-proposal-supersession-migration-requirement.md`). Out of scope
   for a Luo fix (unresolved concurrency/authorization blockers); deferred to the Claude Code
   rebuild. This case's stale original proposal/approval were deliberately left untouched.
2. **Evidence `sufficient` vs. `present` mismatch** — workspace-wide, not case-specific. **Fixed
   and built live.** Two rounds were needed: the first fix updated `createCustomerCase`/
   `regenerateResolutionProposal` but `getCustomerCase` silently failed to inherit it via a
   "reuses the same rules as..." spec cross-reference; a second, explicit fix corrected that.
3. **Shipping-label sufficiency structurally unreachable** — workspace-wide, not case-specific,
   and arguably the most severe: no `damaged_delivery` case could ever pass the evidence gate
   through genuine AI judgment, since the judgment step applied a "does this show damage?" bar to
   a category that can never show damage. **Fixed and built live** (spec v16): sufficiency
   criteria are now category-specific — legibility + shipment-identifying info for
   `shipping_label`, damage/condition depiction for `photo_evidence`, relevance+legibility for
   `invoice`/`correspondence`/`other`. Verified end-to-end: a fresh upload after the fix was
   judged `sufficient`, independently confirmed (different attachment id, post-fix timestamp, no
   duplicate) rather than taken on faith.

## Lessons for future test execution (and for the Claude Code rebuild's own test suite)

- `uploadAttachment` needs a genuine FileRef from the platform's real upload primitive — a raw
  base64 string passed directly via API silently fails AI analysis and falls back to
  `insufficient`. Must go through the actual file-picker UI.
- The declared file type is trusted from the filename/form field, not sniffed from actual bytes —
  a `.jpg`-named file with PNG content silently fails analysis the same way. The Case Detail
  upload form's File Name and File Type fields do **not** auto-populate from the picked file; they
  must be manually typed to genuinely match the selected file's real content, and the file itself
  must be correctly renamed on disk first (do this before opening the upload dialog, not after).
- Avoid embedding meta-commentary like "SYNTHETIC TEST DATA" directly inside AI-classified/
  summarized fields (e.g. complaint text) — it can visibly leak into generated recommendation
  text ("for QA testing purposes" language appeared in one AI-generated proposal).
- A spec's "reuses the same rules as function X" cross-reference between functions is not
  reliable — verify each function's actual behavior independently rather than trusting shared
  wording, even right after a fix that was believed to cover all of them.

## Final state (case `95382638…`, closed out 2026-09-28)

- Resolution proposal `1631f2b4…`: `status: sent`.
- Recovery draft `210131c5…`: `status: sent`, `sent_at: 2026-09-28T04:17:03Z` — Counterparty DPD,
  €45.00, tracking `E2E-TEST-TRACK-0001`.
- Stale original proposal `f72cdfb1…` / approval `666f9cee…`: still untouched, deliberately
  preserved as a live repro instance for Bug #1 (multi-proposal supersession, still unfixed and
  deferred to the Claude Code rebuild — see the migration requirement doc).
- This case now serves two purposes at once: proof the full happy path works, and a standing
  repro of the still-open multi-proposal issue, side by side.
- Next action for Luo: none required to close this test. Whatever comes next (Days 4–7 of the
  12-day plan — duplicate-proposal handling, audit-trail correctness, remaining demo screens) is a
  fresh decision, not a continuation of this specific test.
