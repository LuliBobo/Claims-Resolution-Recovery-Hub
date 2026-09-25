# 01 — Workspace inventory

Snapshot: 2026-09-25. Based on the supplied Luo migration inventory; not an independent production audit. A subsequent Luo report concerning attachment deletion is noted separately below. This is a migration reference, not source code.

## Entities and relationships

The supplied inventory describes 11 application entities:

| Entity | Principal fields and relationships |
|---|---|
| Order | `order_date`, `sales_channel`, customer identifiers, `sku`, `product_name`, `quantity`, `order_value`, `supplier`. Root entity. |
| PolicyDocument | `name`, `document_type`, `version`, `jurisdiction`, `active_status`, `summary`. Root entity. |
| InsightRecord | Derived aggregate with `sku`, `carrier`, `supplier`, `warehouse`, `issue_type`, `frequency`, `trend_direction`. No FK. |
| Shipment | `linked_order_id` → Order; `carrier`, `tracking_number`, `warehouse`, `ship_date`, `delivery_date`, `delivery_status`. |
| Rule | `trigger_type`, `required_evidence`, `recommended_resolution`, `escalation_path`, optional `linked_policy_document_id` → PolicyDocument, `active_status`. |
| CustomerCase | `created_at`, `source`, `status`, `case_type`, customer identifiers, `customer_language`, `order_reference`, `complaint_text`, `internal_english_summary`, `priority`, optional `linked_order_id`/`linked_shipment_id`, `resolution_recommendation`, `recovery_needed`, `assigned_reviewer`, `resolved_at`. |
| Attachment | `linked_case_id` → CustomerCase; `file_name`, `file_type`, `attachment_category`, `ai_notes`, `evidence_status`, opaque `file` reference. No creation timestamp reported. |
| ResolutionProposal | `linked_case_id` → CustomerCase; `recommendation`, `rationale`, `confidence`, `customer_impact`, `business_exposure`, free-text `policy_source`, `needs_human_approval`, `status`. No creation timestamp reported. |
| RecoveryDraft | `linked_case_id` → CustomerCase; `counterparty_type`, `counterparty_name`, `claim_type`, `draft_text`, `estimated_recoverable_value`, `status`, `approved_at`, `sent_at`. |
| AuditEvent | `linked_case_id` → CustomerCase; `event_time`, `actor`, `action`, `previous_state`, `new_state`, `rule_source`, `notes`. |
| HumanApproval | `linked_case_id` → CustomerCase; `approval_type`, optional `linked_resolution_proposal_id` or `linked_recovery_draft_id`, `reviewer`, `decision`, `reviewer_comment`, `decision_time`. No creation timestamp reported. |

`Rule.trigger_type` is matched to `CustomerCase.case_type` in application logic, not by FK. See `04_data_dictionary.md` for reported enums. This overview is **not** a complete column-level listing of types, nullability, constraints or indexes.

## Application components

The supplied inventory reports 34 backend APIs; 9 pages (case queue, case create, case detail, approvals queue, policy/rules admin, insights dashboard, orders, shipments, operations summary); and 2 scheduled jobs (nightly insight recomputation and Monday report generation to the Knowledge Base). No external e-commerce, carrier, CRM or GitHub integration was configured at inventory time. Reported `sent` transitions are manual attestations, not evidence of outbound transmission. Exact API signatures and schedules require separate export. [See `02_business_rules_and_workflows.md`.]

## Snapshot counts

At inventory time: Order 5; PolicyDocument 3; InsightRecord 2; Shipment 5; Rule 3; CustomerCase 4; Attachment 0; ResolutionProposal 7; RecoveryDraft 2; AuditEvent 28; HumanApproval 9. These are historical aggregate counts, not current-live guarantees.

## Schema and lifecycle gaps

ResolutionProposal, HumanApproval and Attachment lack creation timestamps according to the inventory. Multiple proposals for one case have no explicit current/active marker; a denormalized case recommendation is not a reliable substitute for selecting one proposal row. Do not delete apparently duplicate proposals or approvals without tracing references and history. InsightRecord is derived and can be recomputed. Blob storage is opaque in the supplied inventory.

## Attachment deletion: later reported change

After this inventory was produced, Luo Assistant reported a successful build and inspection of deployed generated code removing a one-off UUID exception. It reported the current deletion guard as a case-sensitive `file_name` prefix test for `test_` or `synthetic_` only; the action deletes a single Attachment database row and creates no audit event. The new build ID and independent code verification were not provided here. Prefix checking alone is not proof of caller authorisation. Deletion of the underlying binary remains **unverified**. Do not port this test-data cleanup action as a production evidence-deletion policy.
