# 06 — Acceptance Tests (Public)

Originally written (2026-09-25) as a **hypothetical checklist** derived from spec text alone, before any live execution. **Updated 2026-09-28** after a live E2E verification pass against the actual running app — every item below is now marked with its real, observed result, not a guess. Several original assumptions turned out to be wrong; those are called out explicitly rather than silently corrected, since the gap itself (spec claim vs. actual generated-code behavior) recurred multiple times and is a pattern worth designing around, not just a one-off.

Legend: ✅ verified true as originally stated · ⚠️ verified, but the original wording was incomplete/wrong — see note · ❌ verified false, since fixed · ⏸ not independently tested this pass

## 1. Case intake & auto-triage
- ✅ Non-English complaint text produces a translated/summarized internal English field distinct from the original. Verified against a real Slovak-language case: translation was precise, no meaning lost or added.
- ✅ Omitting case type/priority triggers automatic classification instead of leaving them null. Verified multiple times across different complaint texts.
- ⚠️ Creating a damaged-delivery case matching an active rule produces exactly one new resolution proposal and one new human approval — **true only for the first generation on a case.** Any *subsequent* `regenerateResolutionProposal` call creates an *additional* proposal+approval pair alongside the old one rather than replacing it — there is no "current proposal" concept in the data model at all. Reproduced independently on two separate cases. This is a real, unfixed architectural gap — see the multiple-proposal-supersession requirement doc. Two existing messy cases were manually reconciled (rejecting stale approvals) as an operational workaround, not a fix.
- ✅ A proposal implying recoverable value also produces a recovery draft with its own pending approval.
- ❌→✅ Case status becomes "awaiting approval" once generation completes, with audit events logged — **this was false until 2026-09-28.** No workflow function actually advanced `status` past `'new'`; only a manual case-edit API could. A case could complete its entire approve/send lifecycle and still show "New" in the queue. **Fixed and verified live**: a guarded auto-advance step now fires only from `'new'`, leaving later statuses untouched; the manual-only path to `resolved`/`escalated`/`closed` was deliberately left unchanged, not automated.

## 2. Deterministic evidence gate
- ✅ A damaged-delivery case with no evidence attachments, matched to the applicable carrier claims SOP, produces the fixed "request missing evidence" recommendation.
- ⚠️ "Uploading all three required evidence types and re-reading the case flips completeness to true" — **true, but "uploaded" was ambiguous and hid a real bug.** An attachment existing is not the same as it being judged `sufficient` by AI analysis, and two different code paths originally disagreed about which one counted as "present": the case-level completeness flags accepted any non-`not_applicable` attachment, while the send-gate (below) required genuinely `sufficient`. A case could show `evidenceComplete: true` while sending was still refused. **Fixed live**, all functions now consistently require `sufficient`. Separately: the *displayed proposal recommendation text* does **not** update on a passive re-read — only an explicit regenerate call rewrites it; the live-recomputed part is specifically the evidence-checklist booleans, not the stored recommendation.
- ⚠️ A further, more severe issue found in the same area: the AI sufficiency judgment applied one "does this show damage?" bar to *every* photo category, including shipping labels — which structurally can never depict damage. **No damaged-delivery case could ever reach `evidenceComplete: true` through genuine AI judgment** until this was found and fixed with category-specific sufficiency criteria (legibility + shipment info for labels, damage depiction for item/carton photos, relevance+legibility for other document types).
- ✅ With evidence incomplete, the mark-as-sent action for an *approved* recovery draft is refused with an evidence-related error. Verified directly, multiple times.
- ✅ Removing an evidence attachment flips completeness back to false on the next read (no stale caching).
- ✅ **End-to-end proof**: once both bugs above were fixed, one case was carried all the way through evidence-complete → approved → resolution proposal sent → recovery draft sent — the first fully-closed happy path demonstrated in this workspace, independently verified (not taken on the system's word) by checking the winning attachment record's id, timestamp, and AI notes directly.

## 3. Approval gating
- ✅ Mark-as-sent for a resolution proposal being refused unless approved — verified live against a real pending proposal: refused with an approval-related error, and confirmed the call mutated nothing (proposal status, approval decision, and audit-event count all unchanged before/after).
- ✅ Mark-as-sent for a recovery draft is refused unless approved, and also refused if evidence is incomplete even when approved — both conditions independently confirmed live.
- ✅ Approving/rejecting a proposal-type or draft-type approval updates the linked record's status accordingly, stamping the approval timestamp only on approval — exercised extensively via real reconciliation actions, including confirming that a rejection never alters a *different* approval's own already-recorded human decision.

## 4. Attachment deletion restriction
- ⏸ Refusal for a filename lacking the test/synthetic prefix — established in an earlier session, not re-exercised as a negative case this pass.
- ✅ Attachments with the designated prefix can be deleted — used routinely throughout this pass.
- ✅ A one-off hardcoded exception ID inherited from prior cleanup history should be dropped rather than ported — confirmed **already removed and verified** in the currently-live handler.
- ✅ Deleting an attachment modifies no other entity — confirmed via audit-trail inspection after deletions.
- ⏸ **Still cannot be checked**: whether the underlying binary is purged from file storage on delete — no tool available exposes this; verify independently against whatever storage backend the target uses.

## 5. Insights & reporting
- ✅ Insight recomputation fully replaces the previous aggregate set — verified live: a manual trigger correctly replaced a stale 2-record set with a fresh, accurate 3-record set reflecting a case that had just become resolved.
- ⏸ Scheduled jobs (nightly insights, Monday weekly report) running at their specified cadence *without* manual triggering was **not** observed this pass — only the manual-trigger paths were exercised. The manual and cron paths are documented as invoking the same underlying function, but that shared-code assumption itself hasn't been independently re-verified after the discovery that similar "shares the same logic as X" claims have been wrong before (see §1 and §2 above).
- ✅ Weekly report generation succeeds and produces real, readable output — verified live, including correct "timestamp unavailable" labeling for resolved/approved records that predate certain timestamp fields, rather than silently omitting or guessing dates. Not separately tested for a week with zero activity.

## 6. Policy & Rules Admin (not in original checklist — added 2026-09-28)
- ✅ Creating a Policy Document and a linked Rule via the actual admin create APIs succeeds and is immediately reflected in the list views.
- ✅ A newly created, active Rule is correctly discoverable by the same trigger-type/active-only filter shape a resolution-proposal lookup would use — confirmed by creating a real rule for a case type (`missing_item`) that had no coverage at all, and independently re-querying for it.

## 7. Data model integrity
- ✅ Verified live via direct query across the whole workspace: every human approval has exactly one of its two possible linked-record references set, always matching its declared approval type (0 exceptions across 14 rows). No orphaned Attachment, ResolutionProposal, RecoveryDraft, HumanApproval, or AuditEvent row exists without a valid parent case (0 orphans, 0 null case references, across all entities and all 6 cases).
