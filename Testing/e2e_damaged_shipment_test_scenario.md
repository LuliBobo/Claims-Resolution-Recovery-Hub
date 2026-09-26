# E2E Test Scenario — Damaged-Delivery Complaint (Days 1–3 core workflow)

**Status: PLANNING ONLY. No record has been created, no attachment uploaded, no approval clicked,
no build run.** This document defines the exact scenario and expected results so that you can
decide, separately, whether to execute it live in Luo. Nothing here authorizes an actual write.

## Why this scenario, not the 28 historical cases

Bulk-importing `Sample data/`/`NEW Sample Data/` (28 synthetic cases) would not reproduce their
original timing or state — `createOrder`/`createShipment`/`createCustomerCase` each accept one
record per call, set `createdAt`/`status` server-side, and trigger live LLM calls per case (see
[migration_handoff_csv_to_create_api_payload_specification.md](../migration_handoff_csv_to_create_api_payload_specification.md)
§"Blockers for a safe pilot import"). A single fresh case run through the real create flow is the
only way to observe the actual live behavior.

**Irreversibility warning**: there is no `deleteOrder`/`deleteShipment`/`deleteCustomerCase` API —
once created, this test's Order/Shipment/CustomerCase are permanent (VERIFIED, same source). All
test data below is deliberately fictional and clearly marked as a QA fixture so a permanent record
carries no privacy risk.

---

## Step 0 — Precondition check (read-only, do this first)

Confirm, by looking at the live Policy Documents and Rules screens in Luo:
- A `PolicyDocument` named **exactly** `"DPD Carrier Claims SOP"` exists and is active.
- An active `Rule` (`trigger_type = damaged_delivery`) links to it.

This is required for the evidence-gate behavior below to trigger at all — it's matched by exact
document name, not by ID (per `migration_handoff_internal_02_business_rules_and_workflows.md`,
kept out of the public repo). The last read-only inventory pass counted 3 `PolicyDocument` and 3
`Rule` rows live, consistent with this SOP existing, but re-confirm visually since specs can drift.
If it's missing or inactive, the "forced Request Missing Evidence" behavior in Step 3 won't happen
— still useful information, just a different (also worth recording) result.

---

## Test data (fresh, fictional, clearly marked as a QA fixture)

| Field | Value |
|---|---|
| Customer name | `QA E2E Test Customer` |
| Customer email | `e2e.test+damaged.vase@example.com` |
| SKU | `E2E-TEST-VASE-01` |
| Product | `Handmade Ceramic Vase (E2E Test Item)` |
| Order value | `45.00` |
| Tracking number | `E2E-TEST-TRACK-0001` |
| Order reference (free text on case) | `E2E-TEST-ORD-0001` |

Not reused from any existing sample/demo record (avoids any overlap with the previously-flagged
Elena Rostova / Martin Horvath demo names in `claimflow_luo_playbook.md`).

---

## Step 1 — `createOrder`

| Field | Value |
|---|---|
| orderDate | 2026-09-22 |
| salesChannel | `own_webstore` |
| customerName | `QA E2E Test Customer` |
| customerEmail | `e2e.test+damaged.vase@example.com` |
| sku | `E2E-TEST-VASE-01` |
| productName | `Handmade Ceramic Vase (E2E Test Item)` |
| quantity | `1` |
| orderValue | `45.00` |
| supplier | `Nordic Homeware Trading s.r.o.` |

**Expected (VERIFIED from spec):** returns the full `Order` record including a new `id` (UUID).
Capture this `id` — it's the only way to reference this Order later (no lookup by SKU/order
reference exists).

## Step 2 — `createShipment`

| Field | Value |
|---|---|
| linkedOrderId | *(id from Step 1)* |
| carrier | `DPD` |
| trackingNumber | `E2E-TEST-TRACK-0001` |
| warehouse | `Bratislava Central Warehouse (E2E Test)` |
| shipDate | 2026-09-22 |
| deliveryDate | 2026-09-24 |
| deliveryStatus | `delivered` |

**Expected (VERIFIED):** returns full `Shipment` with new `id`. Fails if `linkedOrderId` doesn't
match an existing Order (FK + NOT NULL enforced). Capture this `id` too.

## Step 3 — `createCustomerCase` (zero attachments at this point)

| Field | Value |
|---|---|
| source | `web_form` |
| caseType | *(omit — testing AI classification)* |
| customerName | `QA E2E Test Customer` |
| customerEmail | `e2e.test+damaged.vase@example.com` |
| customerLanguage | `English` |
| orderReference | `E2E-TEST-ORD-0001` |
| linkedOrderId | *(id from Step 1)* |
| linkedShipmentId | *(id from Step 2)* |
| complaintText | `SYNTHETIC TEST DATA — QA end-to-end test case. Customer reports that the parcel delivered yesterday by DPD contained a ceramic vase that arrived completely shattered/broken into several pieces. No real customer interaction occurred; this case exists solely to verify the damaged-delivery workflow end to end.` |
| priority | *(omit — testing AI scoring)* |
| recoveryNeeded | `true` |

**Expected, in order (VERIFIED from internal business-rules doc, kept out of public repo):**
1. Case created, `status = new` → then `awaiting_approval` once the steps below complete.
2. AI classifies `caseType` — expect `damaged_delivery` (the complaint text uses "shattered"/
   "broken" deliberately to make this unambiguous).
3. AI scores `priority` — record whatever it returns; no strong prior expectation either way.
4. Active Rules for `damaged_delivery` + linked active Policy Documents are fetched.
5. A Resolution Proposal is generated. **Because zero Attachments exist yet**, if the DPD gate
   applies (Step 0 confirmed), the three evidence booleans (shipping label / damaged item /
   outer carton) are all `false` → `evidence_complete = false` → the proposal's recommendation is
   force-set to exactly **`"Request Missing Evidence"`**, `needs_human_approval = true`.
6. A `HumanApproval(approval_type: resolution_proposal, decision: pending)` is created.
7. Because `recoveryNeeded = true`, a Recovery Draft is also generated (`counterparty_type:
   carrier`, since the shipment carrier is DPD), `status = pending_approval`, with its own
   `HumanApproval(approval_type: recovery_draft, decision: pending)`.
8. `AuditEvent` rows are written for each step above (case created, proposal generated, draft
   generated — 3 minimum).

## Step 4 — Upload evidence (via Case Detail page, `upload_attachment`)

Upload three separate files against this case:

| # | File name | `attachment_category` | Purpose (keyword match target) |
|---|---|---|---|
| 1 | `test_e2e_damaged_vase_broken.jpg` | `photo_evidence` | matches "damag"/"broken" |
| 2 | `test_e2e_outer_carton_box.jpg` | `photo_evidence` | matches "carton"/"outer"/"box" |
| 3 | `test_e2e_shipping_label.jpg` | `shipping_label` | shipping-label category match |

(File names are prefixed `test_` deliberately — the only two prefixes `delete_attachment` will
ever act on, per the restricted-cleanup logic already documented.)

**Expected:** each upload returns a new Attachment row; `ai_notes`/`evidence_status` get populated
by the platform's own file analysis (not something to hand-set).

## Step 5 — Re-read the case (`get_customer_case`) after all 3 uploads

**Expected (VERIFIED):** the three evidence booleans are recomputed fresh on this read (they are
never cached/stored) → `evidence_complete` should now flip to `true`.

**Open question this test is specifically meant to resolve** — not settled by the docs alone:
does the *displayed* Resolution Proposal recommendation text change automatically now that
evidence is complete (a read-time re-derivation), or does the stored `recommendation` field stay
literally `"Request Missing Evidence"` until some explicit regenerate action, even though the
evidence checklist itself now shows complete? Record exactly what the Case Detail page shows here
— this is the single most useful fact this test can produce for the Claude Code rebuild.

## Step 6 — Negative branch: try to send before approval / with the wrong order

6a. Attempt `send_recovery_draft` (or the equivalent "mark as sent" UI action) on the Recovery
Draft **before** it has been approved. **Expected:** refused — both `action_resolution_proposal`
and `send_recovery_draft` explicitly require `status = approved` first (VERIFIED).

## Step 7 — Approve, then negative-branch the evidence gate

7a. Via the Approvals Queue, approve the Resolution Proposal (`review_approval`,
`approval_type: resolution_proposal`, `decision: approved`). **Expected:** proposal `status →
approved`; `AuditEvent` logged.

7b. Approve the Recovery Draft the same way. **Expected:** draft `status → approved`,
`approved_at` stamped.

7c. Now that both are approved and evidence is complete (Step 5), attempt `send_recovery_draft`.
**Expected:** succeeds (evidence gate is satisfied).

7d. **Record whether `action_resolution_proposal` (marking the proposal itself "sent") is also
gated by the same evidence check, or only `send_recovery_draft` is** — the docs only explicitly
document the re-check for the recovery draft's send action; this is the second open question worth
settling.

## Step 8 — Reject-path check (do this as a *second*, separate case if you want to keep the
happy-path case clean — optional but cheap)

Create one more minimal case the same way, then reject its Resolution Proposal instead of
approving it. **Expected:** proposal `status → rejected`; per the documented state machine, case
`status` does **not** auto-transition to `resolved`/`escalated`/`closed` on its own — that only
happens via a manual case edit. Confirm this is really what happens (it's currently a documented
claim, not something this specific test has verified live).

---

## Acceptance checklist

- [ ] Step 0 precondition confirmed (or confirmed absent — either is a valid, useful result)
- [ ] Order, Shipment, Case created; ids captured
- [ ] AI classified `caseType = damaged_delivery` and produced some `priority`
- [ ] With 0 attachments: proposal recommendation = exactly `"Request Missing Evidence"`
- [ ] 3 attachments uploaded with the exact file names above
- [ ] After upload: evidence booleans flip to complete on re-read
- [ ] **Open question resolved**: does the displayed recommendation text change live, or only the
      checklist booleans?
- [ ] Send-before-approval correctly refused
- [ ] Both approvals succeed; audit events logged for each
- [ ] Send succeeds once evidence is complete and both are approved
- [ ] **Open question resolved**: is `action_resolution_proposal` also evidence-gated?
- [ ] (Optional) reject-path case confirms case status does not auto-transition
- [ ] Full audit trail reviewed end to end and makes chronological sense

Any deviation from an "Expected" line above is a genuine bug/gap to note for the Day 8–10
reconstruction package — per the 12-day plan, only fix what this test actually reveals, nothing
speculative.
