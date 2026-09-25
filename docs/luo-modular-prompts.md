# Claims Resolution & Recovery Hub — Luo Modular Build Prompts

> **Source document, kept as originally written.** Prompt 16's sample data below uses Spanish as the flagship complaint language. The flagship case actually built in Luo (Elena Rostova, order #ORD-9842, DPD) is in English — see `docs/claimflow-luo-playbook.md` Step 3.1 for the real seed data, and `demo-data/cases/damaged-vase.json` for the version synced into this repo. Also note: this document's entity field names (e.g. "Priority", "Internal English Summary", "Assigned Reviewer") are richer than the baseline in `docs/claimflow-luo-playbook.md`, which `schema/` follows — see `prompts/luo-build-prompt.md` for how the two relate.

## How to use this document
These prompts are designed to help build the MVP in Luo step by step instead of trying to generate the entire application in one pass. The recommended approach is:

1. create the base workspace and data model,
2. build the main case-management flow,
3. add AI modules one by one,
4. add review and analytics last,
5. refine labels, demo data and guided demo mode at the end.

Important rule: after each major Luo prompt, manually inspect the generated entities, views, labels, relationships and workflows before moving to the next module.

---

## Prompt 1 — Foundation and data model
Use this first.

> Build an internal English-language application called “Claims Resolution & Recovery Hub”. Its purpose is to help small and mid-sized e-commerce teams manage customer complaints, damaged deliveries, wrong-item cases, missing-item cases, return requests and recovery actions against carriers or suppliers from one multilingual workspace.
>
> Create database entities with these exact names and fields:
>
> 1. Customer Cases
> - Case ID
> - Created At
> - Source
> - Status
> - Case Type
> - Customer Name
> - Customer Email
> - Customer Language
> - Order Reference
> - Complaint Text
> - Internal English Summary
> - Priority
> - Linked Order
> - Linked Shipment
> - Resolution Recommendation
> - Recovery Needed
> - Assigned Reviewer
>
> 2. Attachments
> - Attachment ID
> - Linked Case
> - File Name
> - File Type
> - Attachment Category
> - AI Notes
> - Evidence Status
>
> 3. Orders
> - Order ID
> - Order Date
> - Sales Channel
> - Customer Name
> - Customer Email
> - SKU
> - Product Name
> - Quantity
> - Order Value
> - Supplier
>
> 4. Shipments
> - Shipment ID
> - Linked Order
> - Carrier
> - Tracking Number
> - Warehouse
> - Ship Date
> - Delivery Date
> - Delivery Status
>
> 5. Policy Documents
> - Document ID
> - Name
> - Document Type
> - Version
> - Jurisdiction
> - Active Status
> - Summary
>
> 6. Rules
> - Rule ID
> - Rule Name
> - Trigger Type
> - Required Evidence
> - Recommended Resolution
> - Escalation Path
> - Linked Policy Document
> - Active Status
>
> 7. Resolution Proposals
> - Proposal ID
> - Linked Case
> - Recommendation
> - Rationale
> - Confidence
> - Customer Impact
> - Business Exposure
> - Policy Source
> - Needs Human Approval
>
> 8. Recovery Drafts
> - Recovery Draft ID
> - Linked Case
> - Counterparty Type
> - Counterparty Name
> - Claim Type
> - Draft Text
> - Estimated Recoverable Value
> - Status
>
> 9. Human Approvals
> - Approval ID
> - Linked Case
> - Approval Type
> - Reviewer
> - Decision
> - Reviewer Comment
> - Decision Time
>
> 10. Audit Events
> - Audit Event ID
> - Linked Case
> - Event Time
> - Actor
> - Action
> - Previous State
> - New State
> - Rule Source
> - Notes
>
> 11. Insight Records
> - Insight ID
> - SKU
> - Carrier
> - Supplier
> - Warehouse
> - Issue Type
> - Frequency
> - Trend Direction
>
> Create relationships between these entities so that Customer Cases can link to Orders, Shipments, Attachments, Resolution Proposals, Recovery Drafts, Human Approvals and Audit Events. Use clear labels and make this structure easy for operations users to understand.

---

## Prompt 2 — Core dashboard and navigation
Use this after the data model exists.

> Create the main application navigation and dashboard for “Claims Resolution & Recovery Hub”.
>
> Add the following top-level views:
> - Dashboard
> - Cases Inbox
> - Case Detail
> - Orders
> - Shipments
> - Policy Documents
> - Rules
> - Review Queue
> - Recovery Queue
> - Analytics
> - Audit Timeline
> - Demo Mode
>
> Build a dashboard with KPI cards for:
> - Open Cases
> - Waiting for Evidence
> - Waiting for Approval
> - Recovery Opportunities
> - Cases Closed This Week
> - Repeated Issue Patterns
>
> Add dashboard widgets for:
> - Recent Cases
> - High-Priority Cases
> - Cases by Type
> - Cases by Language
> - Top Affected SKUs
> - Top Carriers by Complaint Volume
>
> Use clear operational language, not technical language. Make the interface feel like an internal operations tool rather than a generic CRM.

---

## Prompt 3 — Intake inbox and case creation
Use this to create the operational entry point.

> Create a “Cases Inbox” workflow for manual complaint intake.
>
> The operator should be able to create a new Customer Case by entering:
> - customer name,
> - customer email,
> - customer language,
> - order reference,
> - complaint text,
> - source,
> - attachments.
>
> Add a guided case creation form with sections called:
> - Customer
> - Complaint
> - Order Reference
> - Attachments
> - Initial Review
>
> When a new case is created:
> - generate a Case ID,
> - set Status to “New”,
> - create an Audit Event,
> - place the case in the Cases Inbox.
>
> Add filters for:
> - New
> - Waiting for Evidence
> - Waiting for Approval
> - Recovery Draft Ready
> - Closed
>
> Make the Cases Inbox easy to scan and prioritise.

---

## Prompt 4 — Language detection and internal summary
Use this to make the app feel global.

> Add AI support to Customer Cases for language detection and internal summary generation.
>
> For each new case:
> - detect the customer language from the complaint text,
> - store it in Customer Language,
> - generate an Internal English Summary,
> - allow the operator to edit both fields manually.
>
> If the complaint is already in English, still generate a short structured internal summary.
>
> The summary should include:
> - complaint type guess,
> - product issue summary,
> - urgency signal,
> - missing information if obvious.
>
> Clearly label this as AI-assisted and editable.

---

## Prompt 5 — Case classification
Use this to structure the workflow.

> Add AI-assisted complaint classification for Customer Cases.
>
> The system should classify each case into one of these categories:
> - Damaged Delivery
> - Wrong Item
> - Missing Item
> - Defective Product
> - Return Request
> - Other
>
> Store the result in Case Type and show a confidence level.
>
> The operator must be able to manually correct the classification.
>
> In the case detail view, show:
> - AI classification,
> - confidence,
> - editable final classification,
> - short explanation of why the case was classified that way.

---

## Prompt 6 — Order lookup and shipment context
Use this after case classification.

> Create an Order Lookup and Shipment Context module.
>
> In the Case Detail view, when an Order Reference is present, link the case to the matching Order and Shipment records.
>
> Show the following in a dedicated panel:
> - order date,
> - sales channel,
> - SKU,
> - product name,
> - quantity,
> - order value,
> - supplier,
> - carrier,
> - tracking number,
> - warehouse,
> - delivery date,
> - delivery status.
>
> If no matching order is found, clearly show “Order Not Found” and allow manual linking.
>
> Make the case detail page feel like an investigation workspace.

---

## Prompt 7 — Evidence checker
This is one of the most important modules.

> Create an Evidence Checker for Customer Cases.
>
> The Evidence Checker should review the case type, complaint text and linked attachments and identify whether required evidence is present.
>
> Use these simple prototype rules:
> - Damaged Delivery usually needs product photo, outer packaging photo and order reference.
> - Wrong Item usually needs product photo and order reference.
> - Missing Item usually needs order reference and delivery status.
> - Defective Product usually needs product photo and short defect description.
> - Return Request usually needs order reference and reason if provided.
>
> Show an evidence checklist with:
> - Present
> - Missing
> - Not Required
>
> Add an “Evidence Status” field and set it to:
> - Complete
> - Minor Gap
> - Major Gap
> - Insufficient
>
> If something is missing, generate a suggested follow-up request to the customer in the customer’s language.

---

## Prompt 8 — Policy retrieval from uploaded documents
Use this after the evidence checker works.

> Create a Policy Retrieval module for “Claims Resolution & Recovery Hub”.
>
> The application should use uploaded Policy Documents and Rules to support recommendations.
>
> In each Case Detail view, display:
> - relevant rule name,
> - policy document name,
> - version,
> - short excerpt or summary,
> - why that rule is relevant.
>
> Add a section called “Policy Support” that clearly connects the recommendation to an internal document.
>
> The system should never present a recommendation without also showing the supporting policy source when one exists.
>
> Clearly label this as internal policy support, not legal advice.

---

## Prompt 9 — Resolution agent
This creates the main business recommendation.

> Create a Resolution Agent for Customer Cases.
>
> Based on case type, evidence status, linked order and policy support, generate a Resolution Proposal.
>
> Allowed recommendation types:
> - Refund
> - Replacement
> - Partial Credit
> - Request More Evidence
> - Escalate
> - Reject
>
> For each Resolution Proposal, generate:
> - Recommendation
> - Rationale
> - Confidence
> - Customer Impact
> - Business Exposure
> - Policy Source
> - Needs Human Approval
>
> In the case detail view, make the recommendation clear, inspectable and editable.
>
> Do not allow the AI to execute anything automatically.

---

## Prompt 10 — Customer reply draft
Use this to create the visible multilingual value.

> Create a Reply Draft module for customer communication.
>
> For each Customer Case, generate a customer-facing draft reply in the customer’s original language.
>
> Also generate an internal English version for the operator.
>
> The reply should be grounded in the Resolution Proposal and Evidence Checker result.
>
> Possible reply purposes:
> - Ask for missing evidence
> - Confirm replacement path
> - Confirm refund path
> - Explain rejection politely
> - Confirm escalation and expected next step
>
> Make the draft editable before approval.
>
> Clearly separate:
> - Customer Reply Draft
> - Internal Operator Summary

---

## Prompt 11 — Recovery agent
This is the strongest differentiator.

> Create a Recovery Agent for “Claims Resolution & Recovery Hub”.
>
> When a case suggests that a carrier or supplier may be responsible, generate a Recovery Draft.
>
> The Recovery Draft should include:
> - Counterparty Type
> - Counterparty Name
> - Claim Type
> - Draft Text
> - Linked Evidence Summary
> - Estimated Recoverable Value
> - Status
>
> Show recovery opportunities in a separate queue called “Recovery Queue”.
>
> Add logic so that recovery is suggested especially for:
> - damaged delivery,
> - wrong item received from supplier,
> - repeated SKU issues,
> - repeated carrier-related damage.
>
> Make the Recovery Draft operational and concise, not legalistic.

---

## Prompt 12 — Deterministic workflow scoring and routing
Use this to make the app feel controlled.

> Create deterministic workflow scoring for Customer Cases using these five factors, each scored from 0 to 3:
> - Evidence Completeness
> - Policy Clarity
> - Customer Impact
> - Business Exposure
> - Recovery Potential
>
> Calculate a total score and use these workflow rules:
> - 0 to 4 = Quick Review
> - 5 to 7 = Request Evidence or Supervisor Check
> - 8 to 10 = Human Approval Required
> - 11 to 15 = Escalate and No Automatic Closure
>
> Show the factor breakdown in the Case Detail view.
>
> Add a clear note that these thresholds are prototype workflow assumptions.
>
> The scoring should support the process but remain visible and editable by the operator.

---

## Prompt 13 — Human review inbox
This is critical for credibility.

> Create a Human Review workflow and a “Review Queue” view.
>
> Cases should appear in the Review Queue when:
> - the workflow score requires approval,
> - the recommendation is high impact,
> - the case is ambiguous,
> - the operator manually escalates it.
>
> In Review Queue, each item should show:
> - Case ID
> - Case Type
> - Customer
> - Recommendation
> - Recovery Needed
> - Evidence Status
> - Reviewer
> - Current Status
>
> Add these review actions:
> - Approve
> - Approve with Edits
> - Request More Evidence
> - Reject
>
> Every review action should create a Human Approval record and an Audit Event.

---

## Prompt 14 — Audit timeline
Use this to give enterprise-style trust.

> Create an append-only Audit Timeline for each Customer Case.
>
> The timeline should log:
> - case creation,
> - language detection,
> - classification,
> - order linking,
> - evidence status updates,
> - policy retrieval,
> - resolution proposal,
> - reply draft generation,
> - recovery draft generation,
> - human review decisions,
> - status changes.
>
> Each event should show:
> - Event Time
> - Actor
> - Action
> - Previous State
> - New State
> - Rule Source
> - Notes
>
> Make the timeline easy to read and suitable for demo use.

---

## Prompt 15 — Analytics and root-cause view
Use this near the end.

> Create an Analytics view for “Claims Resolution & Recovery Hub”.
>
> Show operational insights for:
> - Cases by Type
> - Cases by Language
> - Cases by Carrier
> - Cases by Supplier
> - Cases by SKU
> - Recovery Opportunities
> - Repeated Issue Patterns
>
> Add widgets or tables for:
> - Top damaged SKUs
> - Top carriers by complaint count
> - Top suppliers by issue frequency
> - Cases waiting too long
> - Cases with high recovery potential
>
> The Analytics page should help users understand recurring failure patterns, not just report totals.

---

## Prompt 16 — Demo mode and sample data
Use this last.

> Create a guided “Demo Mode” for “Claims Resolution & Recovery Hub”.
>
> Add sample data for at least these two scenarios:
>
> 1. Damaged vase case
> - customer complaint in Spanish
> - two attached photos
> - linked order and shipment
> - classified as Damaged Delivery
> - missing outer packaging evidence
> - replacement recommendation
> - customer reply draft in Spanish
> - carrier recovery draft in English
>
> 2. Wrong item case
> - customer complaint in English
> - linked order and supplier
> - classified as Wrong Item
> - replacement recommendation
> - supplier recovery draft
>
> Create a demo-friendly flow so a user can open the dashboard, open a case, inspect evidence, inspect policy support, inspect the recommendation, inspect the recovery draft, approve the action and view the audit trail in a single short session.
>
> Add labels that clearly say:
> - Prototype
> - Human approval required
> - No real external actions executed

---

## Recommended build order
If Luo becomes inconsistent or starts overbuilding, use this exact order:

1. Prompt 1
2. Prompt 2
3. Prompt 3
4. Prompt 4
5. Prompt 5
6. Prompt 6
7. Prompt 7
8. Prompt 8
9. Prompt 9
10. Prompt 10
11. Prompt 11
12. Prompt 12
13. Prompt 13
14. Prompt 14
15. Prompt 15
16. Prompt 16

---

## Practical advice
- Do not paste all prompts at once.
- After each prompt, rename awkward labels manually if needed.
- Keep all AI-generated fields editable.
- If Luo creates too many unnecessary views, simplify before continuing.
- Keep the demo centred on the damaged-vase scenario.
- Protect the concept by storing schema, prompt versions and demo text outside Luo as well.
