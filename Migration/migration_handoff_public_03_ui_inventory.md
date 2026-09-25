# 03 — UI (Pages) Inventory (Public)

9 pages total; no shared/home dashboard exists (each feature area is its own page — a platform
constraint, not a design choice specific to this app).

| Page | Purpose & key actions |
|---|---|
| Case Queue | Browse/filter/search all cases by status, priority, case type, source. |
| Case Create | Manual case intake form; submission triggers the full auto-triage workflow. |
| Case Detail | Central per-case workspace: edit fields, manage attachments (incl. restricted delete), view/regenerate/act on all linked resolution proposals and recovery drafts, evidence checklist, full audit trail. |
| Approvals Queue | Queue of pending human approvals across all cases; approve/reject with optional comment. |
| Policy & Rules Admin | Manage the policy documents and rules driving the resolution-proposal engine; toggle active status. |
| Insights Dashboard | View aggregated trend insights; manually trigger recomputation. |
| Orders Management | Manually manage order records — no live e-commerce integration populates these. |
| Shipments Management | Manually manage shipment records linked to orders. |
| Operations Summary | Read-only KPI/chart dashboard scoped to open cases; no mutating actions. |

## Notable UI/logic gaps relevant to a migration

- **No "active proposal/draft" concept.** When a case accumulates multiple resolution proposals
  or recovery drafts, the Case Detail page lists all of them with per-row actions; nothing in the
  spec designates one as "the" current record. A rebuild that assumes a single canonical
  current proposal per case would be adding behavior the source system does not have.
- **No inbound channel integration**, despite the schema modeling multiple case sources — only
  the manual Case Create and Case Detail edit forms actually write case data in this build.
- **"Sent" statuses are manual attestations**, not real outbound delivery — a target system that
  needs actual email/API delivery to customers or carriers needs new functionality, not a port of
  what exists today.
