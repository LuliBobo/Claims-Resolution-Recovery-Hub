# Import Order & Procedure

## Scope

This document covers **Package A only** (`orders.csv`, `shipments.csv`,
`customer_cases.csv`, `attachments.csv`). Package B files
(`resolution_proposals.csv`, `recovery_drafts.csv`, `human_approvals.csv`,
`audit_events.csv`, `insight_records.csv`) are reference/acceptance-test
fixtures — they are **not** covered by an import procedure here, and
should not be pushed into Luo directly (see `README.md`).

No authenticated Luo API details or database schema export were available
when this dataset was built. This document assumes only that Luo offers
some field-mapped CSV import or manual-entry path for each entity; it does
not assume any specific undocumented import endpoint, and no code that
calls a Luo API has been written as part of this dataset. **If Luo's
actual current field names or enum values differ from `data_dictionary.md`,
the live Luo workspace schema takes precedence — map or transform this
data before importing, rather than forcing Luo to match this document.**

## Required import sequence

Import strictly in this order. Each stage depends on the identifiers
created by the stage before it.

1. **orders.csv**
   No dependencies. Establishes `order_number` as the anchor identifier
   for everything downstream.
2. **shipments.csv**
   Depends on `orders.csv` (`shipments.order_number` must already exist
   in Luo). Do not import before Orders.
3. **customer_cases.csv**
   Depends on `orders.csv` and `shipments.csv` (`customer_cases.order_number`
   and `customer_cases.shipment_number` must both already exist in Luo).
4. **attachments.csv**
   Depends on `customer_cases.csv` (`attachments.case_number` must already
   exist in Luo).

Do not import out of order and do not import a file if any record it
references has not yet been created in Luo — this will produce dangling
or rejected relationship fields.

## Mandatory pilot import

**Before any bulk import of Package A, run a pilot import of exactly 3
orders and their full dependency chain**, then stop and verify before
continuing:

1. Select 3 `order_number` values from `orders.csv`
   (e.g. `TEST-ORD-2026-0001`, `TEST-ORD-2026-0002`,
   `TEST-ORD-2026-0003` — or any 3, since all rows are equally synthetic).
2. Import just those 3 rows from `orders.csv`.
3. Import only the rows from `shipments.csv` whose `order_number` is one
   of those 3.
4. Import only the rows from `customer_cases.csv` whose `order_number` is
   one of those 3 (there may be 0–3 such cases, since not every order has
   a case in this dataset).
5. Import only the rows from `attachments.csv` whose `case_number`
   belongs to a case imported in step 4 (if any).
6. **Stop.** Before importing anything further:
   - Confirm each field landed in the correct Luo field (no silent
     truncation, no type coercion errors, no enum value rejected or
     silently remapped).
   - Confirm the `order_number → shipment_number → case_number →
     attachment_number` relationship chain is intact and navigable inside
     Luo for all 3 pilot orders.
   - Confirm decimal values (`unit_price`, `order_value`) retained two
     decimal places and did not get rounded, truncated, or reformatted
     with a currency symbol.
   - Confirm date and timestamp fields were interpreted as UTC / the
     correct date, not shifted by a timezone assumption.
   - Confirm the `SYNTHETIC TEST DATA —` prefix is visible and intact on
     every text field that carries it, so the pilot records are clearly
     identifiable as test data inside Luo.
7. Only after all of the above are confirmed correct, proceed to import
   the remaining 57 orders and their dependent rows, in the same
   entity order (Orders → Shipments → Customer Cases → Attachments).

If any check in step 6 fails, fix the field mapping (not the underlying
data) and repeat the 3-order pilot before attempting a larger import.

## Fields likely to need manual mapping in Luo

These are flagged **[MAP]** in `data_dictionary.md` and deserve specific
attention during the pilot:

- `orders.notes`, `shipments.notes`, `customer_cases.notes` — confirm Luo
  has a matching free-text field per entity.
- `shipments.tracking_number` — fictional, not a real-carrier-validated
  format; confirm Luo does not reject or attempt to validate it against a
  live carrier API.
- `customer_cases.source` — only `manual` is used in this dataset;
  confirm Luo's enum for this field, if any, includes `manual` and
  whether other values exist that this dataset simply doesn't exercise.
- `attachments.storage_path` — always a `synthetic://attachments/<id>`
  placeholder; Luo's real attachment storage mechanism (file/blob upload)
  is a separate concern and is deliberately not simulated here, since no
  binary content exists for any row.

## After import

Run through `validation_checklist.md` against the data as it now exists
inside Luo (not just the source CSVs) to confirm the import preserved
referential integrity end to end.
