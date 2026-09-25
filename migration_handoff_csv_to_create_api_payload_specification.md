# Read-Only Specification: Synthetic CSV → Luo Create-API Payload Mapping
## Order, Shipment, CustomerCase — Verified Current Implementation

**No writes performed.** This document was produced entirely by read-only inspection: live
Postgres schema (`information_schema`, `pg_constraint`, `pg_enum`), the current workspace spec
(`query_spec`), and prior verified code inspection (`debug_build`, read-only) referenced from
earlier session work. No `create*` API was called, no record was inserted/updated/deleted, no
spec was edited, and no build was run to produce this report.

Every field, type, enum, and behavior below is labeled **VERIFIED** (confirmed directly against
live DB schema and/or live spec text) or **UNVERIFIED / ASSUMPTION** (not confirmed by either
source). Nothing is inferred or carried over from any earlier proposed synthetic schema.

---

## 1. Order — `createOrder`

**Endpoint/function**: `createOrder` (request type `CreateOrderRequest`, response `CreateOrderResponse`) — VERIFIED (spec).

| Field | Type | Required/Optional/Nullable | Default | Validation rules | Verified? |
|---|---|---|---|---|---|
| orderDate | DATE | Required | none | None beyond type (no range check specified) | VERIFIED |
| salesChannel | STRING | Required | none | **Free text — NOT an enum.** No allowed-value list, no length/format constraint exists anywhere in spec or DB (`order.sales_channel` is DB type `text`, not a `USER-DEFINED`/enum type) | VERIFIED |
| customerName | STRING | Required | none | None specified | VERIFIED |
| customerEmail | STRING | Required | none | No email-format regex specified in spec | VERIFIED |
| sku | STRING | Required | none | None specified; **no uniqueness constraint** (DB has no unique index on `sku`) | VERIFIED |
| productName | STRING | Required | none | None specified | VERIFIED |
| quantity | INTEGER | Required | none | None specified (no min/max stated) | VERIFIED |
| orderValue | DECIMAL | Required | none | None specified (no min/max, no currency format stated) | VERIFIED |
| supplier | STRING | Required | none | None specified | VERIFIED |

**System-generated fields not accepted by `createOrder`**: `id` (UUID, server-generated primary key) — VERIFIED (DB: `order.id` is the PK, not present in `CreateOrderRequest`).

**Response**: `CreateOrderResponse` is the full created `Order` record (`$extend: Order`), i.e. it includes `id` (UUID) plus every field above, echoed back — VERIFIED (spec).

---

## 2. Shipment — `createShipment`

**Endpoint/function**: `createShipment` (request type `CreateShipmentRequest`, response `CreateShipmentResponse`) — VERIFIED (spec).

| Field | Type | Required/Optional/Nullable | Default | Validation rules | Verified? |
|---|---|---|---|---|---|
| linkedOrderId | UUID | **Required** | none | Must reference an existing Order — createShipment's process verifies the linked Order exists (errors if not found); DB also enforces this via a `FOREIGN KEY (linked_order_id) REFERENCES "order"(id) ON UPDATE CASCADE ON DELETE CASCADE`, and the column is `NOT NULL` in the DB | VERIFIED |
| carrier | STRING | Required | none | None specified | VERIFIED |
| trackingNumber | STRING | Optional / nullable | none | None specified; **no uniqueness constraint** (DB `tracking_number` has no unique index) | VERIFIED |
| **warehouse** | STRING | **Required** | none | None specified beyond type | **VERIFIED — see explicit answer to Q1 below** |
| shipDate | DATE | Optional / nullable | none | None specified | VERIFIED |
| deliveryDate | DATE | Optional / nullable | none | None specified | VERIFIED |
| deliveryStatus | ENUM | Required | none | Must be one of the 6 listed values (see enum table below) | VERIFIED |

**System-generated fields not accepted by `createShipment`**: `id` (UUID, server-generated PK) — VERIFIED.

**Response**: `CreateShipmentResponse` is the full created `Shipment` record (`$extend: Shipment`), including `id` (UUID) — VERIFIED (spec).

---

## 3. CustomerCase — `createCustomerCase`

**Endpoint/function**: `createCustomerCase` (request type `CreateCustomerCaseRequest`, response `CreateCustomerCaseResponse`) — VERIFIED (spec).

| Field | Type | Required/Optional/Nullable | Default | Validation rules | Verified? |
|---|---|---|---|---|---|
| source | ENUM | Required | none | Must be one of 6 listed values (see enum table) | VERIFIED |
| caseType | ENUM | **Optional** | none stated — AI-classified if omitted | Must be one of 5 listed values if provided | VERIFIED |
| customerName | STRING | Required | none | None specified | VERIFIED |
| customerEmail | STRING | Required | none | No email-format regex specified | VERIFIED |
| customerLanguage | STRING | Required | none | None specified (free text, not a constrained language-code enum) | VERIFIED |
| orderReference | STRING | Optional / nullable | none | Free text, no uniqueness/lookup logic | VERIFIED |
| linkedOrderId | UUID | Optional / nullable | none | If provided, must reference an existing Order (verified in process) | VERIFIED |
| linkedShipmentId | UUID | Optional / nullable | none | If provided, must reference an existing Shipment (verified in process) | VERIFIED |
| complaintText | TEXT | Required | none | None specified | VERIFIED |
| priority | ENUM | **Optional** | none stated — AI-scored if omitted | Must be one of 4 listed values if provided | VERIFIED |
| recoveryNeeded | BOOLEAN | Not marked required or nullable in spec — effectively optional | No default stated in spec | None specified | VERIFIED (absence of stated default is itself verified — treat as **unverified what happens if omitted at runtime**, since the spec text doesn't say) |
| assignedReviewer | STRING | Optional / nullable | none | None specified | VERIFIED |

**System-generated / system-managed fields — NOT accepted as `createCustomerCase` input**:
- `id` (UUID, PK) — VERIFIED
- `createdAt` — server-set to "now" — VERIFIED
- `status` — server-set to `'new'` on creation, not a caller input — VERIFIED
- `internalEnglishSummary` — generated by LLM translation step, not a create input — VERIFIED
- `resolutionRecommendation` — generated by the resolution-proposal engine, not a create input — VERIFIED
- `resolvedAt` — set only when case is later resolved, not a create input — VERIFIED

**Response**: `CreateCustomerCaseResponse` = full created `CustomerCase` (including `id`) **plus** `resolutionProposalId` (UUID, nullable) and `recoveryDraftId` (UUID, nullable) — VERIFIED (spec).

---

## Enum reference tables (VERIFIED against live DB `pg_enum`)

| Enum type | Used by | Allowed values |
|---|---|---|
| `customer_case_source` | CustomerCase.source | email, chat, phone, marketplace, web_form, other |
| `customer_case_case_type` | CustomerCase.caseType | damaged_delivery, wrong_item, missing_item, return_request, other |
| `customer_case_priority` | CustomerCase.priority | low, medium, high, urgent |
| `customer_case_status` | CustomerCase.status (system-set only) | new, in_review, awaiting_approval, resolved, escalated, closed |
| `shipment_delivery_status` | Shipment.deliveryStatus | pending, in_transit, delivered, delayed, lost, returned |

**`sales_channel` (Order) — explicitly checked**: there is **no enum type** for it in the database
(`order.sales_channel` is a plain `text` column, `udt_name = text`) and the spec defines it as a
free STRING field with no allowed-value list. **It is not a constrained enum.** Any value in the
synthetic CSV will be accepted as-is; there is no server-side validation against a fixed list.

---

## Explicit verification of your 6 questions

**1. Is `warehouse` required when creating a Shipment?**
**Yes — VERIFIED.** `Shipment.warehouse` is `NOT NULL` in the live DB schema, and the spec's
`CreateShipmentRequest.warehouse` is listed as required (STRING, required). A create call omitting
it will fail.

**2. How are newly created `Order.id` and `Shipment.id` returned, and how can they be safely
looked up for subsequent foreign-key references?**
**VERIFIED (return path):** Both `createOrder` and `createShipment` responses use the `$extend`
pattern — the full created entity is returned inline, so `id` (UUID) is present directly in the
create call's response body. The only supported way to obtain the new id is to capture it from
that response at creation time.
**VERIFIED (lookup path / limitation):** `getOrder`/`getShipment` accept **only** the record's UUID
`id` — no alternate key (sku, tracking_number, order_reference) is supported for lookup. `listOrders`
matches `searchText` against SKU, Product Name, or Customer Name/Email; `listShipments` matches
`searchText` only against Tracking Number. The spec does not state whether this match is exact or
partial/fuzzy — **UNVERIFIED / ambiguous in spec.** Practical implication: if a downstream Shipment
or CustomerCase row needs to reference an Order or Shipment created earlier in the same import run,
the transform must retain the UUID returned by the original create call in memory/state — there is
no reliable way to re-derive it afterward from a business key like `sku` or `order_reference`.

**3. Is there a lookup or duplicate-prevention mechanism based on a business key (e.g.
`order_reference`, `tracking_number`)?**
**No — explicitly confirmed absent, VERIFIED.** No unique constraint exists in the DB on `sku`,
`tracking_number`, or `order_reference` (only `id` primary keys and the two `linked_order_id`/
`linked_shipment_id` foreign keys exist as constraints). No API process step performs a duplicate
check against any of these fields. Running the same synthetic CSV row twice would create two
separate Order/Shipment/CustomerCase records with different ids — nothing in the system will
detect or block the duplicate.

**4. What exactly does creating a CustomerCase trigger?**
**VERIFIED — confirmed side effects, quoted from spec process steps:**
- LLM translation of complaint text into an "Internal English Summary"
- If `caseType`/`priority` omitted: AI (structured judgment) classification of Case Type and
  scoring of Priority
- CustomerCase record created with `status = 'new'`
- An **Audit Event** recorded for case creation (`action = 'case_created'`)
- Automatic generation of a **Resolution Proposal** (via LLM, evaluated against active Rules/Policy
  Documents), including an evidence-completeness check against the case's Attachments that can
  override the recommendation to "Request Missing Evidence"
- The Resolution Proposal is created with `Needs Human Approval = true`, `status =
  'pending_approval'`, plus a linked **Human Approval** record (`decision = 'pending'`,
  `approvalType = 'resolution_proposal'`)
- A second Audit Event recorded for the resolution proposal generation
- If `recoveryNeeded = true`: LLM drafts a **Recovery Draft** (counterparty, claim type, draft text,
  estimated recoverable value), created with `status = 'pending_approval'`, plus its own linked
  Human Approval record (`approvalType = 'recovery_draft'`) and a third Audit Event
- The response returns the case plus the generated `resolutionProposalId`/`recoveryDraftId`

**Implication for a synthetic import**: creating a CustomerCase is never a "just insert a row"
operation — each row fires LLM calls, judgment calls, and creates 2–3 additional linked records
(Resolution Proposal, optionally Recovery Draft, plus Human Approval rows and Audit Events) per
case.

**5. Is there a supported way to roll back or safely remove pilot Orders, Shipments, and
CustomerCases, including related records?**
**No — explicitly confirmed absent, VERIFIED.** No `deleteOrder`, `deleteShipment`, or
`deleteCustomerCase` API exists in the spec. The only delete API in the entire spec is
`deleteAttachment`, which is restricted to Attachment records whose `file_name` starts with
`test_`/`synthetic_`, and its own spec text explicitly states it must not touch CustomerCase,
Resolution Proposal, Recovery Draft, Human Approval, or Audit Event records. `updateOrder`,
`updateShipment`, `updateCustomerCase`, and `reviewApproval` only mutate fields/status — none
deletes. **No rollback was performed as part of this task**, consistent with your instruction; the
finding above is simply that no supported rollback mechanism currently exists for these three
entities at all — a pilot import today would be permanent unless a removal feature were built
first.

**6. Do any of these create APIs support bulk import?**
**No — confirmed, VERIFIED.** `createOrder`, `createShipment`, and `createCustomerCase` each accept
exactly one record's fields per call; none has a list/array-typed field or a file/CSV input.
Records must be created individually, one API call per row.

---

## Blockers for a safe pilot import (synthetic CSV → these APIs)

1. **No duplicate protection** — re-running the same CSV (or overlapping rows) will silently
   create duplicate Orders/Shipments/CustomerCases; the transform script itself must guarantee
   idempotency (e.g., by tracking which source rows already succeeded) since Luo does not.
2. **No rollback/delete path** — once created, Orders, Shipments, and CustomerCases cannot be
   removed through any existing API. A pilot run's records are permanent until a delete feature is
   built. Do not run a pilot against production-looking data without accepting this.
3. **FK ordering is mandatory and id-passing must be in-memory** — Shipment requires an existing
   Order id (`NOT NULL` FK); CustomerCase's optional FKs likewise need real ids. Since there is no
   business-key lookup, the transform must create Orders first, capture each `id` from the create
   response, then create the corresponding Shipments/CustomerCases referencing those exact ids in
   the same run.
4. **CustomerCase creation is not a neutral write** — every CustomerCase row triggers LLM
   translation/classification/proposal-generation calls and creates additional Resolution Proposal
   / Recovery Draft / Human Approval / Audit Event records. A synthetic pilot of N cases produces
   far more than N new rows across the workspace, and consumes AI usage budget.
5. **`sales_channel` has no validation** — any string will be silently accepted; a CSV with typos
   or inconsistent casing will not be caught by the API.
6. **One-record-per-call only** — no bulk endpoint exists; a transform must issue N individual
   `createOrder`/`createShipment`/`createCustomerCase` calls, which has throughput and partial-
   failure implications (a failure partway through leaves some rows created and others not, with
   no rollback available per point 2).
7. **`searchText` match semantics are unverified** — if the import design ever relies on `listOrders`/
   `listShipments` search as a fallback lookup, note that the spec does not state whether the match
   is exact or partial, so it cannot be treated as a reliable business-key lookup.

---

## Confirmation

This task performed **zero writes and zero builds**. No `create*`/`update*`/`delete*` API was
invoked, no record was created, updated, or deleted, no spec was edited, and `build_spec` was not
called. All data above was obtained via read-only queries (`run_sql` SELECT statements against
`information_schema`/`pg_constraint`/`pg_enum`, and `query_spec` read-only questions against the
live spec). No customer data, complete records, secrets, or attachments are included in this
document.
