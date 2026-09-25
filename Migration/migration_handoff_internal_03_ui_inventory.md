# 03 — UI (Pages) Inventory (Internal)

**VERIFIED** from the live spec. 9 pages total; no shared/home dashboard exists (platform
limitation — each feature area is its own page).

| Page id | Route | Primary entity/API dependencies | Purpose & key actions |
|---|---|---|---|
| case_queue_page | `/cases` | `list_customer_cases` | Browse/filter/search all cases by status, priority, case_type, source; navigate to Case Detail; link to Case Create. |
| case_create_page | `/cases/new` | `create_customer_case` | Manual case intake form; on submit triggers the full auto-triage workflow (translation, classification, proposal/draft generation). |
| case_detail_page | `/cases/:caseId` | `get_customer_case`, `update_customer_case`, `upload_attachment`, `delete_attachment`, `regenerate_resolution_proposal`, `regenerate_recovery_draft`, `action_resolution_proposal`, `send_recovery_draft` | Central workspace for one case: edit fields, manage attachments (incl. restricted delete for test/synthetic evidence), view/regenerate/act on all linked Resolution Proposals and Recovery Drafts, DPD evidence checklist, full audit trail. Lists **all** linked proposals/drafts with no single one flagged "active" (see `internal/07`). |
| approvals_queue_page | `/approvals` | `list_approvals`, `review_approval` | Queue of pending Human Approvals across all cases; approve/reject with optional comment. |
| policy_rules_admin_page | `/policies/admin` | CRUD APIs for `policy_document`, `rule` | Manage the Policy Documents and Rules that drive the resolution-proposal engine; toggle `active_status`. |
| insights_dashboard_page | `/insights/dashboard` | `list_insight_records`, `recompute_insights` | View aggregated trend insights (sku/carrier/supplier/warehouse/issue_type), manually trigger recomputation. |
| orders_page | `/orders/manage` | CRUD APIs for `order` | Manually manage Orders — no live e-commerce integration populates these. |
| shipments_page | `/shipments/manage` | CRUD APIs for `shipment` | Manually manage Shipments linked to Orders. |
| operations_summary_page | `/insights/operations-summary` | `get_operations_summary` | Read-only KPI/chart dashboard scoped to open cases; no mutating actions. |

## Notes on UI logic gaps relevant to migration

- **No "active proposal/draft" concept anywhere in the UI spec.** Case Detail page renders full
  arrays returned by `get_customer_case`; per-record actions (regenerate/approve-linked/send) are
  scoped to each row individually. A rebuild that assumes a single canonical "current" proposal
  per case would be inventing behavior not present in the source system — flag this design gap to
  the target system's designers rather than silently resolving it.
- **No inbound integration UI.** Despite `source` supporting email/chat/phone/marketplace/
  web_form, only the manual Case Create form and Case Detail edit form ever write case data — there
  is no connected mailbox, chat widget, or marketplace webhook in this build.
- **"Sent" is a manual attestation, not a real send.** Both `action_resolution_proposal` and
  `send_recovery_draft` only update a status field; no page has actual outbound email/API calls to
  customers or carriers. A migration target that wants real delivery needs new functionality, not
  a port of what exists.
