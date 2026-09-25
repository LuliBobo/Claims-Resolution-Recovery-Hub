# 04 — Data Dictionary (Internal)

Full column-level reference. **VERIFIED** directly from `information_schema.columns` and
`pg_enum` on the live database — this is the actual deployed schema, not the spec's TypeScript
description of it (the two were cross-checked and found to match exactly, with no drift).

See `01_verified_inventory.md` §1 for the entity-by-entity table (fields, types, nullability,
enum values, FK relationships) — not duplicated here to avoid divergence between two copies.

## Enum types (VERIFIED, full list from `pg_enum`)

| Enum type | Values |
|---|---|
| `attachment_attachment_category` | photo_evidence, invoice, shipping_label, correspondence, other |
| `attachment_evidence_status` | pending_review, sufficient, insufficient, not_applicable |
| `customer_case_case_type` | damaged_delivery, wrong_item, missing_item, return_request, other |
| `customer_case_priority` | low, medium, high, urgent |
| `customer_case_source` | email, chat, phone, marketplace, web_form, other |
| `customer_case_status` | new, in_review, awaiting_approval, resolved, escalated, closed |
| `human_approval_approval_type` | resolution_proposal, recovery_draft |
| `human_approval_decision` | pending, approved, rejected |
| `insight_record_trend_direction` | up, down, stable |
| `policy_document_document_type` | policy, terms, carrier_agreement, supplier_agreement, other |
| `recovery_draft_counterparty_type` | carrier, supplier |
| `recovery_draft_status` | draft, pending_approval, approved, sent, rejected, resolved |
| `resolution_proposal_status` | pending_approval, approved, rejected, sent |
| `rule_trigger_type` | damaged_delivery, wrong_item, missing_item, return_request, other |
| `shipment_delivery_status` | pending, in_transit, delivered, delayed, lost, returned |

## Tables with no creation timestamp (VERIFIED — a real migration gap, not an oversight to silently fix)

- `resolution_proposal` — no `created_at`. Chronological ordering of multiple proposals for the
  same case cannot be derived from the table.
- `human_approval` — no `created_at`. Only `decision_time`, populated solely once a decision is
  made (null while pending).
- `attachment` — no `created_at`. Upload order for multiple attachments on the same case can only
  be reconstructed via the `audit_event` table's `event_time`, not from `attachment` itself.

If the migration target requires strict chronological ordering of these three entities, a new
timestamp column and a backfill strategy (best-effort, from `audit_event.event_time` where an
audit row exists) needs to be part of the migration plan — it does not exist in the source system
today.

## Full table list (VERIFIED — confirms no hidden/undocumented tables, e.g. no blob-storage table)

`attachment, audit_event, customer_case, human_approval, insight_record, order, policy_document,
recovery_draft, resolution_proposal, rule, schema_migrations, shipment`

(`schema_migrations` is Drizzle/platform bookkeeping, not an application entity.)
