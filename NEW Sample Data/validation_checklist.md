# Validation Checklist

Use this checklist both to verify the CSV files as delivered, and (after
the pilot import described in `import_order.md`) to verify the data once
it exists inside Luo. All items below were checked programmatically
against the delivered CSV files and passed with zero errors as of
generation time.

## General format checks (all files)

- [ ] File is UTF-8 encoded.
- [ ] Delimiter is a comma; text fields containing commas/quotes are
      properly quoted.
- [ ] Header row matches the column order in `data_dictionary.md` exactly.
- [ ] No extra, missing, or renamed columns versus `data_dictionary.md`.
- [ ] No enum column contains a value outside the list in
      `data_dictionary.md`.
- [ ] No fabricated field, entity, or relationship exists beyond what is
      documented.
- [ ] Every free-text field required to carry the synthetic-data marker
      begins exactly with `SYNTHETIC TEST DATA —`.

## orders.csv

- [ ] Exactly 60 rows, `order_number` unique, format
      `TEST-ORD-2026-0001`–`TEST-ORD-2026-0060`.
- [ ] `customer_email` always ends in `@example.com`.
- [ ] `quantity` is `1` or `2` for every row.
- [ ] `unit_price` and `order_value` both have exactly two decimal places,
      decimal point, no currency symbol.
- [ ] `order_value == quantity * unit_price` for every row.

## shipments.csv

- [ ] Exactly 60 rows, `shipment_number` unique, format
      `TEST-SHP-2026-0001`–`TEST-SHP-2026-0060`.
- [ ] `tracking_number` unique, format
      `TEST-TRACK-2026-000001`–`TEST-TRACK-2026-000060`.
- [ ] Every `order_number` value appears in exactly one shipment row (no
      order with zero or multiple shipments).
- [ ] Every `order_number` exists in `orders.csv`.
- [ ] `carrier` is one of `DPD`, `Packeta`, `GLS`.
- [ ] `shipment_status` is one of `in_transit`, `delivered`, `delayed`,
      `lost`, `returned`.
- [ ] `shipment_date >= ` linked order's `order_date`.
- [ ] Where `delivery_date` is present, `delivery_date >= shipment_date`.
- [ ] `delivery_date` is blank for every `in_transit`, `delayed`, and
      `lost` row.

## customer_cases.csv

- [ ] `case_number` unique, format `TEST-CASE-2026-0001`–`TEST-CASE-2026-0028`.
- [ ] Every `order_number` / `shipment_number` pair matches an existing
      Order and its actual linked Shipment (not just any shipment).
- [ ] `customer_name` and `customer_email` match the linked Order exactly.
- [ ] `case_type` is one of `damaged_delivery`, `wrong_item`,
      `missing_item`, `return_request`.
- [ ] `priority` is one of `low`, `medium`, `high`, `urgent`.
- [ ] `status` is one of `new`, `in_review`, `awaiting_approval`,
      `resolved`, `escalated`, `closed`.
- [ ] `source` is `manual` for every row.
- [ ] No separate claim-status field exists anywhere in this file.
- [ ] For every `order_number`, at most one case has a status in
      `{new, in_review, awaiting_approval, escalated}` (the "active"
      set) — i.e. no order has more than one active case at a time.

## attachments.csv

- [ ] `attachment_number` unique, format `TEST-ATT-2026-0001` onward,
      no gaps.
- [ ] Every `case_number` exists in `customer_cases.csv`.
- [ ] `filename` starts with `test_` or `synthetic_` for every row.
- [ ] `category` is one of the 7 permitted values.
- [ ] `evidence_status` is one of `present`, `missing`, `invalid`,
      `not_required`.
- [ ] `storage_path` equals exactly
      `synthetic://attachments/<attachment_number>` for every row.
- [ ] No row references a real URL, real file, binary content, external
      storage location, or actual photograph.

## resolution_proposals.csv (Package B)

- [ ] `proposal_number` unique, format `TEST-RP-2026-0001`–`TEST-RP-2026-0028`.
- [ ] Every `customer_cases.csv` case has exactly one proposal (no case
      with zero or multiple proposals).
- [ ] `needs_human_approval` is the literal `true` for every row.
- [ ] `recommendation` is one of the 6 permitted values.

## recovery_drafts.csv (Package B)

- [ ] `recovery_draft_number` unique, format
      `TEST-RD-2026-0001`–`TEST-RD-2026-0018`.
- [ ] Every `case_number` exists in `customer_cases.csv`.
- [ ] No case has more than one recovery draft.
- [ ] `currency` is `EUR` for every row.
- [ ] `estimated_recoverable_value` has two decimal places and does not
      exceed the linked Order's `order_value`.
- [ ] `counterparty_type` is `carrier` or `supplier`; when `carrier`,
      `counterparty_name` is `DPD`/`Packeta`/`GLS`; when `supplier`,
      `counterparty_name` matches the supplier on the linked Order.
- [ ] `status` is one of `pending_approval`, `approved`, `sent`,
      `rejected`.

## human_approvals.csv (Package B)

- [ ] `approval_number` unique, format `TEST-APR-2026-0001`–`TEST-APR-2026-0024`.
- [ ] `related_record_type` and `approval_type` are each `resolution_proposal`
      or `recovery_draft`.
- [ ] `related_record_number` exists in `resolution_proposals.csv` when
      `related_record_type = resolution_proposal`, or in
      `recovery_drafts.csv` when `related_record_type = recovery_draft`.
- [ ] `decided_at` is blank for every row where `status = pending`, and
      populated for every row where `status` is `approved` or `rejected`.
- [ ] `status` is one of `pending`, `approved`, `rejected`.

## audit_events.csv (Package B)

- [ ] `audit_event_number` unique, format `TEST-AUD-2026-0001` onward,
      no gaps.
- [ ] Every `case_number` exists in `customer_cases.csv`.
- [ ] `event_name` is one of the 11 permitted values.
- [ ] `actor_type` is one of `system`, `test_user`, `test_manager`.
- [ ] Rows are in ascending chronological order by `occurred_at`.
- [ ] No case has more than one `resolution_proposal_generated` event and
      no duplicate material proposal-update events exist.

## insight_records.csv (Package B)

- [ ] `insight_number` unique, format `TEST-INS-2026-0001` onward,
      no gaps.
- [ ] `dimension_type` is `sku` or `carrier`.
- [ ] `dimension_value` is a real `sku` from `orders.csv` when
      `dimension_type = sku`, or `DPD`/`Packeta`/`GLS` when
      `dimension_type = carrier`.
- [ ] `trend_direction` is one of `up`, `down`, `flat`,
      `insufficient_data`.
- [ ] `complaint_count` equals the actual count of `customer_cases.csv`
      rows matching that dimension value (via linked Order sku, or linked
      Shipment carrier).
- [ ] `estimated_recoverable_value` equals the sum of
      `recovery_drafts.estimated_recoverable_value` for cases matching
      that dimension value (0.00 where no drafts exist).
- [ ] No direct foreign-key column exists in this file — reconciliation
      is by value, not by key, as specified.

## Post-import checks (inside Luo, after the 3-order pilot)

- [ ] All Package A relationship chains (`order → shipment → case →
      attachment`) are navigable inside Luo for the 3 pilot orders.
- [ ] No enum value was silently remapped, rejected, or coerced by Luo's
      importer.
- [ ] Decimal and date/timestamp formatting survived the import unchanged.
- [ ] The `SYNTHETIC TEST DATA —` marker is visible on every field that
      carries it, inside Luo's own record view.
- [ ] No Package B file has been imported into Luo as if it were live
      system-generated history.

## Result of this build

Every check above was run programmatically against the delivered CSV
files. **Result: 0 errors.**
