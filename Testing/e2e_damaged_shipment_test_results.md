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
| `sendRecoveryDraft` succeeds once evidence complete + approved | ⏸ **Not yet reached** — blocked by Bug #3 below at session handoff |

**No fully-closed happy path (evidence-complete → approved → successfully sent) has been
demonstrated in this workspace yet.** Two real bugs blocked it in sequence; a third was found and
fixed along the way. See `Migration/migration_handoff_public_02_business_rules_and_workflows.md`
for the corrected canonical business-rule description these findings feed into.

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
   a category that can never show damage. **Found and diagnosed; fix proposed but not yet built**
   — session was interrupted by Luo's daily quota before the fix diff was reviewed.

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

## State at handoff (for resuming)

- Resolution proposal `1631f2b4…`: `status: sent`.
- Recovery draft `210131c5…`: `status: approved`, `sent_at: null` — blocked only by Bug #3.
- Stale original proposal `f72cdfb1…` / approval `666f9cee…`: untouched, preserved as a repro
  instance for Bug #1.
- Next action: get the Bug #3 fix diff reviewed and built, re-verify `evidenceComplete: true`,
  then retry `sendRecoveryDraft` on `210131c5…` (already approved, no re-approval needed) — this
  would be the first fully closed happy path demonstrated in this workspace.
