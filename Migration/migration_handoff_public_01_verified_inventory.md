# 01 — Verified Inventory (Public)

Sanitized for public repository use — no customer names, emails, order references, tracking
numbers, or other case-level personal data appear anywhere in this file. See
`PUBLIC_REPOSITORY_REVIEW.md` (kept outside this package) for what was excluded and why.

All content **VERIFIED** directly against the live spec and live database schema
(`information_schema.columns`, `pg_enum`) and live aggregate row counts. Live build:
`STATUS_DONE`, `success: true`. Live spec matches the deployed build (no unbuilt draft changes).

---

## 1. Entities, fields, types, enums, relationships

11 entities. Schema confirmed to match the spec's TypeScript interfaces exactly — no drift found.

- **Order** — root entity: order_date, sales_channel, customer identifiers, sku, product_name,
  quantity, order_value, supplier. No FKs.
- **PolicyDocument** — name, document_type (policy/terms/carrier_agreement/supplier_agreement/
  other), version, jurisdiction, active_status, summary. No FKs.
- **InsightRecord** — derived aggregate: sku, carrier, supplier, warehouse, issue_type, frequency,
  trend_direction (up/down/stable). No FKs; rebuilt wholesale by a recompute operation.
- **Shipment** — linked_order_id (FK → Order), carrier, tracking_number, warehouse, ship_date,
  delivery_date, delivery_status (pending/in_transit/delivered/delayed/lost/returned).
- **Rule** — rule_name, trigger_type (damaged_delivery/wrong_item/missing_item/return_request/
  other), required_evidence, recommended_resolution, escalation_path, linked_policy_document_id
  (FK → PolicyDocument, optional), active_status.
- **CustomerCase** — the central entity: created_at, source (email/chat/phone/marketplace/
  web_form/other), status (new/in_review/awaiting_approval/resolved/escalated/closed), case_type
  (damaged_delivery/wrong_item/missing_item/return_request/other), customer identifiers,
  customer_language, order_reference, complaint_text, internal_english_summary, priority
  (low/medium/high/urgent), linked_order_id / linked_shipment_id (FK, optional),
  resolution_recommendation (denormalized latest-proposal text), recovery_needed,
  assigned_reviewer, resolved_at. One-to-many parent of Attachment, ResolutionProposal,
  RecoveryDraft, AuditEvent, HumanApproval.
- **Attachment** — linked_case_id (FK → CustomerCase), file_name, file_type, attachment_category
  (photo_evidence/invoice/shipping_label/correspondence/other), ai_notes, evidence_status
  (pending_review/sufficient/insufficient/not_applicable), file (opaque storage reference).
  **VERIFIED: no creation-timestamp column exists.**
- **ResolutionProposal** — linked_case_id (FK), recommendation, rationale, confidence,
  customer_impact, business_exposure, policy_source (free text, not a real FK),
  needs_human_approval, status (pending_approval/approved/rejected/sent),
  **customer_reply_draft (text, nullable — added 2026-09-28/29)**: an AI-generated,
  customer-facing reply written in the case's `customer_language`, produced in the same
  generation call as `recommendation`/`rationale`/etc. Distinct from those internal-facing
  fields — this one is meant to be usable as-is for an actual customer reply, and is null on
  every proposal generated before this field existed. Closes a real gap between the original
  product concept (which always described multilingual customer reply drafting as a core
  capability) and what had actually been built — verified live with a Slovak-language test case:
  populated, genuinely in Slovak (not English), reads as an appropriate customer-facing reply
  with no internal notes leaking in.
  **VERIFIED: no creation-timestamp column exists** — this is a genuine schema gap when several
  proposals accumulate against one case; see §5 and the acceptance-test checklist.
- **RecoveryDraft** — linked_case_id (FK), counterparty_type (carrier/supplier), counterparty_name,
  claim_type, draft_text, estimated_recoverable_value, status (draft/pending_approval/approved/
  sent/rejected/resolved), approved_at, sent_at.
- **AuditEvent** — linked_case_id (FK), event_time, actor, action, previous_state, new_state,
  rule_source, notes. The only entity with a genuine per-event timestamp.
- **HumanApproval** — linked_case_id (FK), approval_type (resolution_proposal/recovery_draft),
  linked_resolution_proposal_id / linked_recovery_draft_id (FK, mutually exclusive by type),
  reviewer, decision (pending/approved/rejected), reviewer_comment, decision_time (set only once
  decided). **VERIFIED: no creation-timestamp column exists either.**

### Relationship graph
```
Order ──< Shipment (linked_order_id)
Order ──< CustomerCase (linked_order_id, optional)
Shipment ──< CustomerCase (linked_shipment_id, optional)
PolicyDocument ──< Rule (linked_policy_document_id, optional)
CustomerCase ──< Attachment / ResolutionProposal / RecoveryDraft / AuditEvent / HumanApproval (linked_case_id)
ResolutionProposal ──< HumanApproval (linked_resolution_proposal_id, optional)
RecoveryDraft ──< HumanApproval (linked_recovery_draft_id, optional)
```
`Rule.trigger_type` is matched against `CustomerCase.case_type` at evaluation time — an
application-level match, not a foreign key.

---

## 2. Pages, backend APIs, jobs, rules, integration points

**34 backend APIs** covering CRUD for Order/Shipment/PolicyDocument/Rule/CustomerCase, plus
attachment upload/restricted-delete, proposal/draft generation & regeneration, human-review
actions, mark-as-sent actions, insight recomputation, operations-summary aggregation, a narrow
recovery-draft value-correction tool, manual audit-event creation, and weekly report generation.

**9 pages**: case queue, case create, case detail, approvals queue, policy & rules admin, insights
dashboard, orders management, shipments management, and a read-only operations summary dashboard.
No shared cross-feature home dashboard exists (platform constraint).

**2 scheduled jobs**: nightly insight recomputation; weekly (Monday) report generation writing
Markdown to the Knowledge Base. No webhooks, no inbound knowledge-base triggers.

**Rule evaluation**: active Rules matching a case's `case_type`, plus their linked active
PolicyDocuments, are fetched; an LLM produces the proposal fields. A deterministic override
("evidence gate") applies specifically when the matched policy document is a particular named
carrier-claims SOP for damaged-delivery cases — see `02_business_rules_and_workflows.md` for the
exact logic.

**External integrations**: none configured. All "integration points" are internal platform
capabilities — LLM text generation, a structured judgment engine (classification/evidence
judging), file-analysis on attachment upload, and Knowledge Base write access (report output
only). No live e-commerce, carrier, or CRM system is connected; no automated outbound
communication is sent by the system itself — "sent" statuses are manual attestations. No GitHub
integration is configured in this workspace, and the spec does not reference GitHub anywhere.

---

## 3. Build identifier and implemented behaviours

Live build confirmed `STATUS_DONE`/`success: true`, matching the current default spec — deployed
code reflects everything described in this package. Key implemented behaviours: human-approval
gating before any proposal/draft can be marked sent; a deterministic evidence-completeness
override for a specific carrier-claims SOP; a restricted attachment-deletion API (prefix-based,
plus one hardcoded one-time exception ID — see §6); two scheduled jobs.

---

## 4. Aggregate record counts (VERIFIED, live counts — no per-record data)

| Entity | Count |
|---|---|
| Order | 5 |
| PolicyDocument | 3 |
| InsightRecord | 2 |
| Shipment | 5 |
| Rule | 3 |
| CustomerCase | 4 |
| Attachment | 0 |
| ResolutionProposal | 7 |
| RecoveryDraft | 2 |
| AuditEvent | 28 |
| HumanApproval | 9 |

---

## 6. Attachment-deletion implementation (VERIFIED via read-only inspection of generated code)

- The delete-authorization guard lives in a single generated backend handler file and nowhere
  else; UI call sites contain no authorization logic of their own.
- Guard logic (verified exact form): allow deletion only if the attachment's file name starts with
  a `test_` or `synthetic_` prefix, **or** the attachment's id exactly equals one specific
  hardcoded UUID that was a one-time exception for an accidental non-conforming test record.
- That hardcoded-UUID branch is still present, unconditional, and reachable in the live code — not
  dead code. Recommendation for the migration target: do not port this one-off exception verbatim;
  it is meaningless outside this workspace's own accidental test data.
- The handler's only database side effect is a single-row delete of the Attachment record; no
  other entity is touched and no audit event is created by this action.

## 7. Binary storage deletion — UNVERIFIED

No blob/file-object table exists in this database; the Attachment table stores only an opaque
reference. No tool available in this review could confirm whether deleting an Attachment row also
purges the underlying binary from platform file storage, or leaves an orphaned blob. Flag this
explicitly as an open question for whoever owns the target file-storage layer.
