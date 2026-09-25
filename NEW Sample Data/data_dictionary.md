# Data Dictionary

Column order below is the exact column order used in each CSV file. Fields
marked **[MAP]** are technical/synthetic-test fields that likely need
manual field mapping or a decision in Luo (they may not have a direct
equivalent in Luo's current schema, or Luo may name/type them
differently) — confirm each one against the live workspace before import.

---

## 1. orders.csv (Package A)

| # | Column | Type | Notes |
|---|---|---|---|
| 1 | order_number | string | Unique. Format `TEST-ORD-2026-0001`–`TEST-ORD-2026-0060`. Relationship key for Order. |
| 2 | order_date | date (YYYY-MM-DD) | |
| 3 | customer_name | string | Fictional. |
| 4 | customer_email | string | Fictional, `@example.com` domain only. |
| 5 | sku | string | Fictional SKU code. |
| 6 | product_name | string | Fictional product name matching `sku`. |
| 7 | quantity | integer | `1` or `2` only. |
| 8 | unit_price | decimal(2) | Decimal point, 2 decimal places, no currency symbol. |
| 9 | order_value | decimal(2) | Must equal `quantity * unit_price`. |
| 10 | supplier | string | Fictional supplier/company name. |
| 11 | notes | string **[MAP]** | Must start with `SYNTHETIC TEST DATA —`. Confirm Luo has a free-text notes field on Order, or map to Luo's equivalent. |

---

## 2. shipments.csv (Package A)

| # | Column | Type | Notes |
|---|---|---|---|
| 1 | shipment_number | string | Unique. Format `TEST-SHP-2026-0001`–`TEST-SHP-2026-0060`. Relationship key for Shipment. |
| 2 | order_number | string (FK) | → `orders.order_number`. Each order_number appears exactly once across all shipments. |
| 3 | carrier | enum | `DPD`, `Packeta`, `GLS`. |
| 4 | tracking_number | string **[MAP]** | Unique. Format `TEST-TRACK-2026-000001`–`TEST-TRACK-2026-000060`. Fictional — not a real carrier tracking identifier or API reference. Confirm Luo's tracking-number field does not expect a live-carrier-validated format. |
| 5 | shipment_date | date (YYYY-MM-DD) | On or after linked Order's `order_date`. |
| 6 | delivery_date | date (YYYY-MM-DD), optional | Blank when not yet delivered (`in_transit`, `delayed`, `lost`). On or after `shipment_date` when present. |
| 7 | shipment_status | enum | `in_transit`, `delivered`, `delayed`, `lost`, `returned`. |
| 8 | notes | string **[MAP]** | Must start with `SYNTHETIC TEST DATA —`. |

---

## 3. customer_cases.csv (Package A)

| # | Column | Type | Notes |
|---|---|---|---|
| 1 | case_number | string | Unique. Format `TEST-CASE-2026-0001`–`TEST-CASE-2026-0028`. Relationship key for Customer Case. |
| 2 | created_at | timestamp (UTC) | |
| 3 | order_number | string (FK) | → `orders.order_number`. |
| 4 | shipment_number | string (FK) | → `shipments.shipment_number`. Must be the shipment belonging to the same `order_number`. |
| 5 | customer_name | string | Must match the linked Order's `customer_name`. |
| 6 | customer_email | string | Must match the linked Order's `customer_email`. |
| 7 | case_type | enum | `damaged_delivery`, `wrong_item`, `missing_item`, `return_request`. |
| 8 | priority | enum | `low`, `medium`, `high`, `urgent`. |
| 9 | status | enum | `new`, `in_review`, `awaiting_approval`, `resolved`, `escalated`, `closed`. There is no separate claim-status field — `status` is the single source of truth for case state. An order has at most one **active** case at a time, where active = status in `{new, in_review, awaiting_approval, escalated}`. |
| 10 | complaint_text | string | Must start with `SYNTHETIC TEST DATA —`. |
| 11 | source | enum | `manual` (only value used in this dataset). **[MAP]**: confirm whether Luo's `source` field permits other values (e.g. `email`, `portal`) that simply aren't exercised here. |
| 12 | notes | string **[MAP]** | Must start with `SYNTHETIC TEST DATA —`. |

---

## 4. attachments.csv (Package A)

| # | Column | Type | Notes |
|---|---|---|---|
| 1 | attachment_number | string | Unique. Format `TEST-ATT-2026-0001` onward. Relationship key for Attachment. |
| 2 | case_number | string (FK) | → `customer_cases.case_number`. |
| 3 | filename | string | Starts with `test_` or `synthetic_`. No real file behind it. |
| 4 | category | enum | `damaged_item_photo`, `outer_carton_photo`, `shipping_label_photo`, `invoice`, `proof_of_delivery`, `customer_message`, `other`. |
| 5 | evidence_status | enum | `present`, `missing`, `invalid`, `not_required`. Drives evidence-aware claim gating: a case whose required attachments are not all `present` should not progress past evidence checks. |
| 6 | uploaded_at | timestamp (UTC) | On or after the linked case's `created_at`. |
| 7 | storage_path | string **[MAP]** | Always `synthetic://attachments/<attachment_number>` — a placeholder scheme, not a real URL or storage location. Luo's real attachment storage (its own file/blob field) must be mapped separately; no binary content exists for any row. |
| 8 | notes | string **[MAP]** | Must start with `SYNTHETIC TEST DATA —`. |

No real URLs, files, binary content, external storage, or actual
photographs are referenced anywhere in this file.

---

## 5. resolution_proposals.csv (Package B — reference fixture only)

| # | Column | Type | Notes |
|---|---|---|---|
| 1 | proposal_number | string | Unique. Format `TEST-RP-2026-0001`–`TEST-RP-2026-0028`. Relationship key for Resolution Proposal. |
| 2 | case_number | string (FK) | → `customer_cases.case_number`. Exactly one proposal per case_number. |
| 3 | recommendation | enum | `Request Missing Evidence`, `File Carrier Claim`, `Issue Customer Refund`, `Arrange Replacement Shipment`, `Approve Standard Return`, `Escalate for Manual Review`. |
| 4 | rationale | string | Must start with `SYNTHETIC TEST DATA —`. |
| 5 | needs_human_approval | boolean | Literal `true` for every row. |
| 6 | generated_at | timestamp (UTC) | After the linked case's `created_at`. |

---

## 6. recovery_drafts.csv (Package B — reference fixture only)

| # | Column | Type | Notes |
|---|---|---|---|
| 1 | recovery_draft_number | string | Unique. Format `TEST-RD-2026-0001`–`TEST-RD-2026-0018`. Relationship key for Recovery Draft. |
| 2 | case_number | string (FK) | → `customer_cases.case_number`. At most one Recovery Draft per case_number. |
| 3 | counterparty_type | enum | `carrier`, `supplier`. |
| 4 | counterparty_name | string | `DPD` / `Packeta` / `GLS` when `counterparty_type = carrier`; the supplier linked to the case's Order when `counterparty_type = supplier`. |
| 5 | estimated_recoverable_value | decimal(2) | Must not exceed the linked Order's `order_value`. |
| 6 | currency | enum | `EUR` (only value used). |
| 7 | status | enum | `pending_approval`, `approved`, `sent`, `rejected`. |
| 8 | draft_text | string | Must start with `SYNTHETIC TEST DATA —`. |
| 9 | created_at | timestamp (UTC) | |
| 10 | updated_at | timestamp (UTC) | On or after `created_at`. |

---

## 7. human_approvals.csv (Package B — reference fixture only)

| # | Column | Type | Notes |
|---|---|---|---|
| 1 | approval_number | string | Unique. Format `TEST-APR-2026-0001`–`TEST-APR-2026-0024`. Relationship key for Human Approval. |
| 2 | case_number | string (FK) | → `customer_cases.case_number`. |
| 3 | related_record_type | enum | `resolution_proposal`, `recovery_draft`. |
| 4 | related_record_number | string (FK) | → `resolution_proposals.proposal_number` when `related_record_type = resolution_proposal`, or → `recovery_drafts.recovery_draft_number` when `related_record_type = recovery_draft`. |
| 5 | approval_type | enum | `resolution_proposal`, `recovery_draft` — matches `related_record_type` on every row in this dataset. |
| 6 | status | enum | `pending`, `approved`, `rejected`. |
| 7 | requested_at | timestamp (UTC) | |
| 8 | decided_at | timestamp (UTC), optional | Blank when `status = pending`; set otherwise. |
| 9 | decided_by | string **[MAP]** | Fictional test-manager name, e.g. `Test Manager – Elena Rybárová`. Blank when `status = pending`. Confirm whether Luo expects a user reference (account/ID) here rather than a free-text name. |
| 10 | decision_notes | string | Must start with `SYNTHETIC TEST DATA —`. |

---

## 8. audit_events.csv (Package B — reference fixture only)

| # | Column | Type | Notes |
|---|---|---|---|
| 1 | audit_event_number | string | Unique. Format `TEST-AUD-2026-0001` onward. Relationship key for Audit Event. Assigned in chronological order of `occurred_at`. |
| 2 | case_number | string (FK) | → `customer_cases.case_number`. |
| 3 | event_name | enum | `customer_case_created`, `customer_case_updated`, `resolution_proposal_generated`, `resolution_proposal_updated`, `recovery_draft_created`, `recovery_draft_updated`, `human_approval_created`, `human_approval_approved`, `human_approval_rejected`, `attachment_added`, `attachment_removed`. |
| 4 | occurred_at | timestamp (UTC) | File is sorted ascending by this column. |
| 5 | actor_type | enum | `system`, `test_user`, `test_manager`. |
| 6 | event_details | string | Must start with `SYNTHETIC TEST DATA —`. |

This file is explicitly **not** an import instruction: Luo's real audit
trail must be system-generated from real workflow actions. This file
exists so expected audit output can be reviewed and diffed against, not
loaded in as history.

No duplicate material `resolution_proposal_updated`-type events are
generated per case (at most one generation event per case, since each
case has exactly one proposal).

---

## 9. insight_records.csv (Package B — reference fixture only)

| # | Column | Type | Notes |
|---|---|---|---|
| 1 | insight_number | string | Unique. Format `TEST-INS-2026-0001` onward. Relationship key for Insight Record. |
| 2 | dimension_type | enum | `sku`, `carrier`. |
| 3 | dimension_value | string | A valid `sku` (from `orders.csv`) when `dimension_type = sku`; a valid `carrier` (`DPD`/`Packeta`/`GLS`) when `dimension_type = carrier`. |
| 4 | period_start | date (YYYY-MM-DD) | |
| 5 | period_end | date (YYYY-MM-DD) | |
| 6 | complaint_count | integer | Reconciles exactly to the count of `customer_cases.csv` rows matching this dimension value (via the case's linked Order sku, or linked Shipment carrier) within the period. |
| 7 | estimated_recoverable_value | decimal(2) | Sum of `recovery_drafts.estimated_recoverable_value` for cases matching this dimension value within the period (0.00 if none). |
| 8 | trend_direction | enum | `up`, `down`, `flat`, `insufficient_data`. |
| 9 | narrative | string | Must start with `SYNTHETIC TEST DATA —`. |
| 10 | generated_at | timestamp (UTC) | After `period_end`. |

No direct foreign key exists from `insight_records.csv` to any other
file — it is an aggregated/derived record. Its values reconcile to
Customer Cases and Recovery Drafts as described above rather than
referencing them by key.

---

## Full enum reference (all permitted values used in this dataset)

- **Customer Case — case_type**: `damaged_delivery`, `wrong_item`, `missing_item`, `return_request`
- **Customer Case — priority**: `low`, `medium`, `high`, `urgent`
- **Customer Case — status**: `new`, `in_review`, `awaiting_approval`, `resolved`, `escalated`, `closed`
- **Shipment — carrier**: `DPD`, `Packeta`, `GLS`
- **Shipment — shipment_status**: `in_transit`, `delivered`, `delayed`, `lost`, `returned`
- **Attachment — category**: `damaged_item_photo`, `outer_carton_photo`, `shipping_label_photo`, `invoice`, `proof_of_delivery`, `customer_message`, `other`
- **Attachment — evidence_status**: `present`, `missing`, `invalid`, `not_required`
- **Resolution Proposal — recommendation**: `Request Missing Evidence`, `File Carrier Claim`, `Issue Customer Refund`, `Arrange Replacement Shipment`, `Approve Standard Return`, `Escalate for Manual Review`
- **Recovery Draft — counterparty_type**: `carrier`, `supplier`
- **Recovery Draft — status**: `pending_approval`, `approved`, `sent`, `rejected`
- **Human Approval — related_record_type / approval_type**: `resolution_proposal`, `recovery_draft`
- **Human Approval — status**: `pending`, `approved`, `rejected`
- **Audit Event — event_name**: `customer_case_created`, `customer_case_updated`, `resolution_proposal_generated`, `resolution_proposal_updated`, `recovery_draft_created`, `recovery_draft_updated`, `human_approval_created`, `human_approval_approved`, `human_approval_rejected`, `attachment_added`, `attachment_removed`
- **Audit Event — actor_type**: `system`, `test_user`, `test_manager`
- **Insight Record — dimension_type**: `sku`, `carrier`
- **Insight Record — trend_direction**: `up`, `down`, `flat`, `insufficient_data`

No enum value, field, entity, or relationship outside what is listed in
this dictionary is used anywhere in the dataset.
