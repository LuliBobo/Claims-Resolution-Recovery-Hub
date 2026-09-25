# Luo build prompt

Paste the block below into Luo in English, as-is. Source: `docs/concept.md`.

---

Build an internal English-language application called "Claims Resolution & Recovery Hub". Its purpose is to help small and mid-sized e-commerce teams manage returns, damaged-goods complaints, warranty claims and recovery cases from one multilingual workspace. Create database entities for Customer Cases, Attachments, Orders, Shipments, Policy Documents, Rules, Resolution Proposals, Recovery Drafts, Human Approvals, Audit Events and Insight Records. Create a dashboard with open cases, cases waiting for evidence, cases waiting for approval, recovery opportunities, repeated issue categories and recent audit activity.

Create an intake workflow for customer complaints received through form entry or manual inbox copy-paste. Each case should capture customer name, language, order reference, complaint text, attached images, date, sales channel and desired outcome if stated. Add AI-assisted classification to distinguish withdrawal, damaged delivery, defective product, wrong item, missing item and other complaint types. Show classification confidence and allow manual correction.

Create an Order Lookup view that links the complaint to order details, shipment details, SKU, carrier and supplier. Add an Evidence Checker that identifies whether required items are present, such as product photo, outer packaging photo, invoice, delivery date or tracking number. If evidence is missing, show a checklist and generate a polite customer request for the missing materials.

Add a Policy Retrieval module that searches uploaded internal PDF documents and rules to find the relevant complaint and recovery guidance. For every case, show the exact policy excerpt, source document and rule version supporting the recommendation. Create a Resolution Agent that recommends refund, replacement, partial credit, escalation or rejection. Create a multilingual Reply Draft module that prepares a customer reply in the customer's language and an internal English summary for the operator.

Create a Recovery Agent that prepares a carrier or supplier recovery draft when relevant. The draft should include counterparty, claim type, linked order, linked evidence, damage summary, estimated recoverable amount and next action. Do not connect to any live courier or payment system. Mark the system clearly as "Prototype — human approval required before any external action."

Create deterministic workflow routing using five scored factors from 0 to 3: evidence completeness, policy clarity, customer impact, business exposure and recovery potential. Apply prototype thresholds: 0–4 quick review; 5–7 request evidence or supervisor check; 8–10 human approval required; 11–15 escalate and block auto-closure. Show the factor breakdown in every case.

Create visible AI roles for Intake Agent, Classification Agent, Policy Retrieval Agent, Resolution Agent and Recovery Agent. Add a Human Review inbox with Approve, Approve with edits, Request more evidence and Reject options. Record every recommendation, edit, approval and case-state change in an append-only audit timeline. Add an analytics page with repeated issue trends by SKU, carrier, warehouse and supplier. Include sample demo data for a damaged-vase case and a wrong-item case. Use a guided five-minute demo mode.

---

## Seeding Luo with the prototype assets already in this repo

When Luo asks for policy documents, rules or sample cases, use the files already prepared here instead of writing them from scratch inside Luo:

- Sample cases: `demo-data/cases/damaged-vase.json`, `demo-data/cases/wrong-item.json`
- Policy excerpts: `demo-data/policy-documents/`
- Decision thresholds: `rules/decision-rules.yaml`
- Reply templates: `i18n/reply-templates/`

Keeping Luo's seed data in sync with these files means the demo data survives if the Luo workspace becomes unavailable.
