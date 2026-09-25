# Product requirements — Claims Resolution & Recovery Hub

Source concept: `docs/concept.md` (rationale/market framing) and `docs/claimflow-luo-playbook.md` (the actual build sequence and entity schema the live Luo app was seeded from — `schema/` follows it exactly). The flagship demo case is Elena Rostova / order #ORD-9842 / DPD, in English; see `docs/demo-script.md` and `docs/spoken-pitch.md` for the adapted, English-language pitch/demo assets actually used.

## One-line pitch

Claims Resolution & Recovery Hub helps e-commerce teams resolve customer complaints faster, recover losses from carriers or suppliers, and keep a human in control of every high-impact decision.

## Target users

- Small/mid-sized e-commerce operator handling complaints in a shared inbox.
- Operations lead responsible for order quality, refunds and delivery issues.
- Customer-support manager needing faster, more consistent complaint handling.

## Core job to be done

Turn incoming complaint messages, photos and order references into a correct, explainable operational decision without manually copying information across disconnected tools.

## MVP modules

| Module | MVP behaviour |
|---|---|
| Intake Inbox | Receives complaint e-mails or form submissions with attachments |
| Case Classifier | Distinguishes withdrawal, warranty, damage, missing-item and wrong-item cases |
| Order Lookup | Connects the complaint to order, SKU, shipment and carrier |
| Evidence Checker | Identifies missing photos, invoice data or packaging proof |
| Policy Retrieval | Reads internal PDFs/SOPs/rules to support a recommendation |
| Resolution Agent | Recommends refund, replacement, partial credit, escalation or rejection |
| Reply Drafting | Prepares multilingual customer communication |
| Recovery Agent | Generates carrier or supplier claim drafts and evidence bundles |
| Human Review | Approves, edits or rejects the proposed actions |
| Ops Analytics | Tracks root causes, recovery rates and recurring failure patterns |

Full entity list and required fields: `schema/*.schema.json`. Workflow scoring and thresholds: `rules/decision-rules.yaml`.

## Five-minute demo script

Full screen-by-screen script: `docs/demo-script.md`. Summary:

1. Receive a complaint: Elena Rostova reports a shattered glass vase (order #ORD-9842, DPD) with one photo.
2. Identify the order: hub links the complaint to order, SKU, carrier and delivery date.
3. Classify the case: labelled as damaged delivery.
4. Check evidence completeness: outer-box and shipping-label photos missing, flagged (DPD requires them within 48 hours).
5. Retrieve the policy: Policy Retrieval surfaces the relevant excerpt from the merchant's complaint guide and DPD carrier claim rules.
6. Recommend the customer resolution: Resolution Agent proposes a replacement with a reply draft.
7. Generate recovery action: Recovery Agent prepares a carrier-claim package (order data, evidence references, damage summary) for DPD.
8. Require human approval: reviewer approves the reply and the claim, outcome recorded.
9. Show prevention insight: analytics view shows repeated damage for the same SKU/carrier route.

Demo data for this script: `demo-data/cases/damaged-vase.json`. Second story (wrong-item, Slovak, demonstrates multilingual reply drafting): `demo-data/cases/wrong-item.json`.

## Non-goals for the MVP

- No live courier, payment or ERP/WMS integrations — recovery drafts are prepared, not submitted.
- No legal or regulatory automation, and no claim of determining statutory rights.
- No model may silently override the deterministic workflow-routing rule in `rules/decision-rules.yaml`.

## Success criteria

- A new judge/user understands the problem within 20 seconds.
- One complaint moves from intake to recommendation without manual data rewriting.
- Missing evidence is clearly detected and explained.
- Every recommendation cites a visible policy source.
- A human can approve, edit or reject every proposed customer and recovery action.
- The audit timeline shows who changed what and when.
- The analytics view surfaces at least one repeated issue pattern.
- The project can be re-themed for a different commerce/operations challenge in under a day (see `docs/concept.md`, "Competition adaptation").
- The product narrative and core assets survive even if the Luo workspace becomes unavailable (this repo is that guarantee).
