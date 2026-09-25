# Claims Resolution & Recovery Hub — Synthetic Test Dataset

## Purpose

This is a fully synthetic dataset for testing, demonstrations, dashboard
validation, workflow validation, evidence-aware claim gating, and
risk-report generation in the Luo workspace **"Claims Resolution & Recovery
Hub."** No row in this dataset represents a real person, real order, real
shipment, or real financial transaction. All identifiers, names, emails,
and amounts are invented for test purposes.

- All customer emails use the `@example.com` domain (RFC 2606 reserved for
  documentation/testing — never a live mailbox).
- All order numbers, shipment numbers, tracking numbers, case numbers, and
  other business identifiers use a `TEST-` prefix and are not real carrier
  or logistics identifiers.
- All supplier and company names are invented and do not refer to real
  businesses.
- Every free-text field that could carry narrative content begins with the
  literal string `SYNTHETIC TEST DATA —` so it is unmistakable in any Luo
  view, export, or report generated from this data.

## Two packages, two purposes

This dataset does not assume Luo accepts every file as a direct import, and
it does not assume any undocumented Luo API or import endpoint exists. No
authenticated Luo API details or database schema export were available
when this dataset was built, so the packaging below is a safety-first
default, not a claim about what Luo actually supports.

### Package A — Safe Core Import

Files: `orders.csv`, `shipments.csv`, `customer_cases.csv`,
`attachments.csv`.

These four files represent source-of-truth business records (what was
ordered, what shipped, what the customer reported, what evidence exists).
They are intended for direct import into Luo, or for manual record
creation in Luo, **after field mapping is confirmed against Luo's actual
current schema** (see `import_order.md`). They contain no derived,
workflow-generated, or audit content.

### Package B — Derived Workflow Test Fixtures

Files: `resolution_proposals.csv`, `recovery_drafts.csv`,
`human_approvals.csv`, `audit_events.csv`, `insight_records.csv`.

These five files represent what Luo's own workflows would normally
generate *from* Package A records: AI/rule-based recommendations, draft
recovery claims, human approval decisions, the audit trail, and aggregated
insights. They are provided as **reference fixtures and acceptance-test
data only** — logically consistent with Package A and with each other —
so that:

- test scenarios and expected outcomes can be written down and reviewed
  before any workflow runs,
- QA/dashboards can be validated against a known-good expected state,
- and workflow output can later be diffed against these fixtures.

**Do not import Package B directly into Luo.** Doing so risks creating
proposals, drafts, approvals, or audit events that did not actually pass
through Luo's own workflow logic, and audit events in particular are
meant to be an immutable system-generated record — importing synthetic
ones would misrepresent Luo's real audit history. The recommended,
safest path is:

1. Import Package A only.
2. Let Luo's existing workflows generate real Resolution Proposals,
   Recovery Drafts, Human Approvals, Audit Events, and Insight Records
   from the imported Package A data.
3. Use Package B as the expected/reference values to check that generated
   output against.

## Files in this dataset

| # | File | Package | Rows |
|---|------|---------|------|
| 1 | orders.csv | A | 60 |
| 2 | shipments.csv | A | 60 |
| 3 | customer_cases.csv | A | 28 |
| 4 | attachments.csv | A | 42 |
| 5 | resolution_proposals.csv | B | 28 |
| 6 | recovery_drafts.csv | B | 18 |
| 7 | human_approvals.csv | B | 24 |
| 8 | audit_events.csv | B | 179 |
| 9 | insight_records.csv | B | 17 |
| — | README.md | — | — |
| — | data_dictionary.md | — | — |
| — | import_order.md | — | — |
| — | validation_checklist.md | — | — |

See `data_dictionary.md` for exact column definitions and enum values,
`import_order.md` for the recommended import sequence and pilot-import
procedure, and `validation_checklist.md` for the checks to run before and
after import.

## Format conventions

- Encoding: UTF-8.
- Delimiter: comma. Text fields containing commas or quotes are
  double-quoted per standard CSV quoting.
- Dates: `YYYY-MM-DD`.
- Timestamps: ISO 8601 UTC, `YYYY-MM-DDTHH:MM:SSZ`.
- Decimal numbers: decimal point, two decimal places, no currency symbol,
  no thousands separator.
- Booleans: lowercase literal `true` / `false` (used only in
  `resolution_proposals.csv.needs_human_approval`, which is `true` for
  every row).
- Blank relationship or optional fields are left as an empty CSV value
  (`,,`) — never a placeholder string such as `N/A` or `-`.

## Assumptions made (no confirmed Luo schema)

Because no authenticated Luo schema export was available, the following
assumptions were made and **must be verified against the live Luo
workspace before any import**:

1. Luo's field names for each entity match the column names used here
   (see `data_dictionary.md`). If Luo's actual field names differ, this
   is a mapping problem to solve during import, not a reason to alter the
   underlying data.
2. Luo's enum/status values for case status, shipment status, priority,
   case type, attachment category, evidence status, resolution
   recommendation, recovery draft status, approval status, audit event
   name, actor type, and insight dimension/trend match the enum lists in
   `data_dictionary.md`. These are the only enum values used anywhere in
   this dataset — no other status or type value appears.
3. Luo does not require internal database UUIDs for import; all
   relationships in this dataset use the business identifiers listed
   below instead. If Luo's importer requires internal IDs, those will be
   assigned or mapped by Luo at import time, not invented here.
4. Luo can accept a CSV per entity with one header row. If Luo's actual
   import mechanism differs (e.g. requires a different file structure,
   a combined format, or manual entry only), the CSV content is still
   valid as the source data to map from.

**Wherever this specification and Luo's real, current schema disagree,
the actual Luo workspace schema takes precedence.** Map or transform the
data below to match Luo before importing; do not force Luo to match this
document.

## Relationship keys (business identifiers)

| Entity | Key |
|---|---|
| Order | `order_number` |
| Shipment | `shipment_number` |
| Customer Case | `case_number` |
| Attachment | `attachment_number` |
| Resolution Proposal | `proposal_number` |
| Recovery Draft | `recovery_draft_number` |
| Human Approval | `approval_number` |
| Audit Event | `audit_event_number` |
| Insight Record | `insight_number` |

No internal database UUIDs are used as relationship keys anywhere in this
dataset.

## What this dataset is not

- It is not a load-test dataset (volumes are small, by design, for manual
  and automated functional review).
- It is not a confirmed Luo import spec — see "Assumptions" above.
- It is not a source of real customer, order, shipment, or financial data
  under any circumstance.
