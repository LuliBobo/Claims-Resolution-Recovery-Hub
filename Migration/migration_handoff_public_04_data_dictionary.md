# 04 — Data Dictionary (Public)

Full column-level reference, cross-checked against the live database and found to match the
spec's schema exactly (no drift). See `01_verified_inventory.md` §1 for the entity-by-entity
breakdown (fields/types/nullability/enums/relationships) — not duplicated here.

## Enum types (full list)

| Enum | Values |
|---|---|
| Attachment category | photo_evidence, invoice, shipping_label, correspondence, other |
| Attachment evidence status | pending_review, sufficient, insufficient, not_applicable |
| Case type | damaged_delivery, wrong_item, missing_item, return_request, other |
| Case priority | low, medium, high, urgent |
| Case source | email, chat, phone, marketplace, web_form, other |
| Case status | new, in_review, awaiting_approval, resolved, escalated, closed |
| Approval type | resolution_proposal, recovery_draft |
| Approval decision | pending, approved, rejected |
| Insight trend direction | up, down, stable |
| Policy document type | policy, terms, carrier_agreement, supplier_agreement, other |
| Recovery draft counterparty type | carrier, supplier |
| Recovery draft status | draft, pending_approval, approved, sent, rejected, resolved |
| Resolution proposal status | pending_approval, approved, rejected, sent |
| Rule trigger type | damaged_delivery, wrong_item, missing_item, return_request, other |
| Shipment delivery status | pending, in_transit, delivered, delayed, lost, returned |

## Tables with no creation timestamp — a genuine migration gap

- **Resolution proposals** have no creation timestamp — chronological ordering of multiple
  proposals against one case cannot be derived from the table.
- **Human approvals** have no creation timestamp — only a decision timestamp, populated solely
  once a decision is made.
- **Attachments** have no creation timestamp — upload order across multiple attachments on one
  case can only be reconstructed from the audit log, not from the attachment table itself.

A migration target that needs strict chronological ordering for these three entities must add a
timestamp column and define a backfill strategy (best-effort from the audit log where available)
— this does not exist in the source system today.

## Full table list (confirms no hidden/undocumented tables, e.g. no separate blob-storage table)

Order, PolicyDocument, InsightRecord, Shipment, Rule, CustomerCase, Attachment,
ResolutionProposal, RecoveryDraft, AuditEvent, HumanApproval — plus platform schema-migration
bookkeeping, not an application entity.
