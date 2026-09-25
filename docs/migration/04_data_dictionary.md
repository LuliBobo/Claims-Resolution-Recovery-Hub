# 04 — Data dictionary (partial)

Observed enum values from the supplied Luo inventory (2026-09-25). This is **not** a complete column-level schema or CSV import template. Obtain exact required fields, database types, nullability, FK constraints and API/import mappings from the current workspace before generating import files.

| Field/domain | Reported allowed values |
|---|---|
| Attachment `attachment_category` | `photo_evidence`, `invoice`, `shipping_label`, `correspondence`, `other` |
| Attachment `evidence_status` | `pending_review`, `sufficient`, `insufficient`, `not_applicable` |
| CustomerCase `case_type` | `damaged_delivery`, `wrong_item`, `missing_item`, `return_request`, `other` |
| CustomerCase `priority` | `low`, `medium`, `high`, `urgent` |
| CustomerCase `source` | `email`, `chat`, `phone`, `marketplace`, `web_form`, `other` |
| CustomerCase `status` | `new`, `in_review`, `awaiting_approval`, `resolved`, `escalated`, `closed` |
| HumanApproval `approval_type` | `resolution_proposal`, `recovery_draft` |
| HumanApproval `decision` | `pending`, `approved`, `rejected` |
| InsightRecord `trend_direction` | `up`, `down`, `stable` |
| PolicyDocument `document_type` | `policy`, `terms`, `carrier_agreement`, `supplier_agreement`, `other` |
| RecoveryDraft `counterparty_type` | `carrier`, `supplier` |
| RecoveryDraft `status` | `draft`, `pending_approval`, `approved`, `sent`, `rejected`, `resolved` |
| ResolutionProposal `status` | `pending_approval`, `approved`, `rejected`, `sent` |
| Rule `trigger_type` | `damaged_delivery`, `wrong_item`, `missing_item`, `return_request`, `other` |
| Shipment `delivery_status` | `pending`, `in_transit`, `delivered`, `delayed`, `lost`, `returned` |

`ResolutionProposal`, `HumanApproval` and `Attachment` reportedly have no creation timestamp. The case-level recommendation is denormalized text; no explicit active proposal pointer was reported. `AuditEvent` has `event_time`. `InsightRecord` is derived and recomputed. The reported schema contains 11 application entities; the platform's migration bookkeeping is not an application entity. Absence of a blob table in the inspected schema does not prove whether platform-managed files are retained or deleted.

**Correction to earlier synthetic-data guidance:** values such as `damaged_item_photo` as an attachment category, `present` as an evidence-status enum, and `flat`/`insufficient_data` as stored insight trend enums are **not** in this reported Luo schema. Do not import them without a documented transformation into actual fields/values. Likewise, do not assume `manual` is a valid Case `source` value.
