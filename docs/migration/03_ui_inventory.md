# 03 — UI inventory

Public migration reference based on the supplied Luo inventory (2026-09-25). The inventoried application has nine pages; this is not a screenshot or executable UI export.

| Page | Reported purpose |
|---|---|
| Case Queue | Browse, search and filter cases by status, priority, case type and source. |
| Case Create | Manual case intake; submission starts classification and proposal workflow. |
| Case Detail | Case editing; attachment upload and restricted test cleanup; linked proposals, recovery drafts, evidence checklist, actions and audit trail. |
| Approvals Queue | Review pending proposal/draft approvals. |
| Policy & Rules Admin | Edit policies/rules and active status. |
| Insights Dashboard | View aggregates and trigger recomputation. |
| Orders Management | Manage order records manually. |
| Shipments Management | Manage shipments linked to orders. |
| Operations Summary | Read-only open-case KPI/chart dashboard. |

The inspected system has no explicit active/current ResolutionProposal marker; Case Detail may list multiple proposals with per-row actions. Do not silently choose the newest by row order when the source has no creation timestamp. For the applicable DPD case, show the evidence checklist and disable Send Draft unless evidence is complete and the draft is approved; the backend must separately enforce the same condition. `Sent` is a manual status attestation, not confirmation that the app delivered a message externally. No live inbound channel was configured at inventory time.
