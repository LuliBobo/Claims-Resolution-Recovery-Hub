# 02 — Business Rules & Workflows (Public)

Sanitized for public repository use. No customer or case-level personal data appears below —
examples use generic placeholders only.

## Case lifecycle
```
new → in_review → awaiting_approval → resolved
                              \
                               → escalated → closed
```
`awaiting_approval` is set automatically once a generated proposal/draft requires human sign-off.
`resolved`/`escalated`/`closed` are set via manual case edits. Every status change is logged as an
AuditEvent (previous_state → new_state).

**Verified via live E2E testing (2026-09-28):** the "`awaiting_approval` set automatically" claim
above was, for a long time, aspirational rather than actually implemented — no workflow function
(`createCustomerCase`, `regenerateResolutionProposal`, `regenerateRecoveryDraft`, `reviewApproval`,
`actionResolutionProposal`, `sendRecoveryDraft`) ever advanced `status` past `'new'`; only the
manual `updateCustomerCase` could. A case could complete its entire approval/send lifecycle and
still show `'new'` in the Case Queue. **Fixed and built live**: a guarded auto-advance step
(`'new' → 'awaiting_approval'` only, never touching later statuses) was added to the three
generation functions. The `resolved`/`escalated`/`closed` transitions remain intentionally
manual-only, unchanged — this fix only restored the one transition the design always claimed to
have. **Migration takeaway: verify status-transition behavior by testing a case through its full
lifecycle, not by reading the spec's stated intent** — this is the second time in this project a
documented "X happens automatically" claim didn't match the generated code (see the
`getCustomerCase` evidence-flag regression above).

## Case intake & auto-triage workflow
1. Case submitted (manually, in this build — no live inbound channel integration exists despite
   the schema modeling `source` as email/chat/phone/marketplace/web_form).
2. Non-English complaints are translated/summarized via LLM into an internal English summary.
3. Missing case_type/priority are classified automatically via a judgment engine.
4. Active Rules matching the case_type, plus their linked active Policy Documents, are fetched.
5. An LLM produces a Resolution Proposal (recommendation/rationale/confidence/customer_impact/
   business_exposure/policy_source). A deterministic evidence-gate override (below) can force the
   recommendation regardless of what the LLM proposed.
6. A pending Human Approval is created for the proposal.
7. If financial recovery is implied, a Recovery Draft (claim text to a counterparty) is also
   generated with its own pending Human Approval.
8. Case status becomes `awaiting_approval`; every step is audit-logged.

## Deterministic evidence-gate override (generalized description)

Applies to damaged-delivery cases matched against one specific, exactly-named carrier-claims SOP
policy document:
- Three completeness booleans (shipping label photo / damaged item photo / outer carton photo) are
  recomputed **fresh on every read** from the case's current attachments — never cached/stored.
- If not all three are present, the proposal's recommendation is force-overridden to a fixed
  "request missing evidence" value, regardless of the LLM's own output.
- The mark-as-sent action for the corresponding recovery draft independently re-checks the same
  gate and refuses to proceed if evidence is incomplete, even if the draft was already approved.
- Because the check is recomputed on every read rather than stored, adding or removing evidence
  attachments retroactively flips the gate immediately, without needing to regenerate anything.
- **Migration note**: the policy match is by an exact document *name* string embedded in the
  generation logic, not by ID or a dedicated flag. Renaming that policy document on a target
  system would silently disable the gate unless the matching logic is updated too.

### Corrections from live E2E verification (2026-09-26/27)

Running a real end-to-end test surfaced two defects in the description above that were only
discovered by executing the flow, not by reading the spec text:

1. **"Present" is not the same as "sufficient," and the functions disagreed on which one they
   meant.** Each attachment carries its own `evidence_status`
   (`pending_review`/`sufficient`/`insufficient`/`not_applicable`), separate from the case-level
   completeness booleans above. Case creation and proposal (re)generation originally treated any
   non-`not_applicable` status as "present" — but the mark-as-sent gate independently required
   `evidence_status == 'sufficient'` specifically. Result: a case could show all three booleans
   `true` (and the recommendation would read as if evidence were complete) while mark-as-sent
   still refused, because the two code paths used different definitions of "present." **Fixed
   live**: all functions now consistently require `evidence_status == 'sufficient'`. Migration
   takeaway: don't trust a spec's "reuses the same rules as X" cross-reference between functions —
   each function's actual generated/implemented behavior needs independent verification, since one
   of these diverged from its own stated intent even after the fix was first believed complete.
2. **No sufficiency criteria were ever defined per evidence category, and the default judgment
   bar cannot be met by every category.** The AI step that sets `evidence_status` applied a single
   "does this depict damage?" test uniformly to all three required photo types — which a shipping
   label can never satisfy, since it documents the shipment, not the item's condition. A live test
   with a real, legible shipping-label image confirmed it was rejected as `insufficient` for
   exactly this reason. As found, **no damaged-delivery case could ever reach `evidenceComplete:
   true` through genuine AI judgment** — this is not a demo-data artifact, it's a structural gap.
   **Fixed and built live, verified end-to-end**: explicit, category-specific sufficiency criteria
   were added — `photo_evidence` still requires visible damage/condition, `shipping_label`
   requires legibility plus identifying shipment info (tracking number, carrier, address, ship
   date), `invoice`/`correspondence`/`other` require legibility and relevance. A fresh upload
   after the fix was judged `sufficient` under the corrected criteria, and the full downstream
   chain (evidence complete → approved → resolution proposal sent → recovery draft sent) completed
   successfully — the first fully-closed happy path demonstrated in this workspace. **Migration
   takeaway: define sufficiency criteria per evidence category explicitly from the start; never
   reuse one category's pass/fail bar for another.**

## Approval workflow
1. A reviewer sees every pending Human Approval in a dedicated queue.
2. Approving/rejecting sets the decision, reviewer, optional comment, and a decision timestamp.
3. Approval flips the linked Resolution Proposal or Recovery Draft to `approved` (or `rejected`).
4. Only an `approved` proposal/draft can subsequently be marked `sent` — both mark-as-sent actions
   explicitly refuse otherwise.
5. **"Sent" is a manual attestation only** — the system does not itself transmit anything to a
   customer or counterparty; a human is expected to have done so before flipping this status.

## Attachment lifecycle
1. Upload: file stored, AI analysis populates internal notes, a judgment engine sets an
   evidence-sufficiency status.
2. Attachments feed the evidence gate above for applicable cases.
3. Deletion is a restricted-use cleanup action only — see `01_verified_inventory.md` §6 for the
   verified guard logic. No other deletion path exists for attachments.

## Insights & reporting
- Insight recomputation (manual + nightly job) aggregates resolved/escalated cases into trend
  records, fully replacing the prior set each run.
- Weekly report generation (manual + Monday job) aggregates the past week's activity into a
  Markdown report saved to the Knowledge Base — write-only, nothing reads it back into the app.
- A read-only operations-summary aggregation powers a KPI dashboard scoped to open cases.

## Data-quality tool
A narrow API exists to correct only a recovery draft's estimated recoverable value, logging an
audit event — intended for fixing data-entry mistakes, not a general financial workflow.
