# Claims Resolution & Recovery Hub — Hackathon-Ready MVP Concept (Sharpened Version)

> **Source document, kept as originally written.** This version's flagship story uses a Spanish-language complaint. The flagship case actually built in Luo (Elena Rostova, order #ORD-9842, DPD) is in English — see `docs/spoken-pitch.md` and `docs/demo-script.md` for the adapted, English-language versions actually used for the live pitch/demo.

## Executive decision
The strongest hackathon version of this project is not a generic AI assistant for returns. It is a **multilingual complaint-to-recovery command centre** that turns one messy customer message into two coordinated, evidence-backed actions:

1. a customer resolution, and  
2. a recovery claim against the responsible carrier or supplier.

> **One complaint in. Two controlled outcomes out.**

That framing is the core difference. Many tools help merchants log returns or generate support replies. Fewer tools visibly connect customer service, warehouse context, carrier responsibility, supplier recovery and human approval in one compact workflow. For a hackathon, that end-to-end transformation is more memorable than “AI writes an e-mail faster”.

The recommended MVP should therefore be positioned as a **live operations workflow**, not a chatbot and not a helpdesk clone. The judging value comes from orchestration, clarity, explainability and business impact.

## Stronger positioning

### What this is
**Claims Resolution & Recovery Hub is a multilingual operations layer for e-commerce teams that need to resolve complaints quickly and recover avoidable losses.**

### What this is not
- Not a generic customer-support copilot.
- Not a full helpdesk replacement.
- Not a legal decision engine.
- Not a warehouse management system.
- Not just an AI reply generator.

### Strongest one-line pitch
**Claims Resolution & Recovery Hub converts customer complaints into evidence-checked resolutions and recovery actions, with human approval before anything important happens.**

### Strongest tagline
> **Resolve faster. Recover more. Keep humans in control.**

## Why this version is stronger for hackathons
The original concept is commercially sound, but on a hackathon stage it risks being interpreted as “another customer-support AI”. The sharpened version fixes that by making the product visibly operational, multi-sided and outcome-driven.

Judges should see five things immediately:
- a real business problem,
- a live case workflow,
- clear AI orchestration,
- a human-in-the-loop safeguard,
- measurable business value.

This concept does that because it shows a complaint being classified, checked, explained, routed and monetarily recovered rather than only answered.

## The wow demo moment
The best demo story is intentionally simple and visual:

> A customer sends an e-mail in Spanish with photos of a shattered glass vase. The support agent would normally forward the e-mail to operations, ask the warehouse for packaging details, check the complaint rules manually and then maybe forget to file a carrier claim.

In the demo, the system:

1. detects the customer language,
2. links the case to the order,
3. classifies it as shipping damage,
4. identifies missing evidence,
5. finds the internal rule,
6. recommends a replacement,
7. drafts a Spanish customer reply,
8. generates a carrier recovery case in English,
9. asks a human to approve both actions,
10. records the full audit trail,
11. updates analytics to show repeated damage for the same SKU or carrier.

The wow moment is not the multilingual draft. The wow moment is that **one complaint becomes a complete, explainable operational chain in under a minute**.

## Demo-first product definition

### One-line pitch
**Claims Resolution & Recovery Hub helps e-commerce teams resolve complaints faster, recover losses more consistently and stay in control of every important decision.**

### Ideal demo user
- A small e-commerce operations lead.
- A support manager in a growing Shopify, WooCommerce or Shoptet-based store.
- A founder who still handles complaints through a shared inbox.
- A hackathon team needing a practical, judge-friendly AI workflow product.

### Core job to be done
“When a customer complains, help me decide what to do, what evidence is missing, what policy applies, what to tell the customer and whether we can recover the loss from someone else.”

## Five-minute demo script

### Scenario A: Damaged delivery
1. A customer complaint arrives with two photos and a short message.
2. The hub identifies the language and translates an internal summary into English.
3. Order Lookup finds the order, SKU, carrier and delivery date.
4. Classification labels the case as shipping damage.
5. Evidence Checker says the product photo is present but the outer-box photo is missing.
6. Policy Retrieval displays the relevant internal complaint rule and carrier-claim requirement.
7. Resolution Agent recommends “Send replacement after approval”.
8. Reply Draft creates a customer response in the original language asking for one missing photo and confirming the intended replacement path.
9. Recovery Agent prepares a pre-filled carrier claim draft with linked evidence.
10. Human Review approves the customer reply and the recovery draft.
11. Analytics updates a recurring issue counter for that SKU and carrier.

### Scenario B: Wrong item received
1. A customer uploads a photo of the wrong product.
2. The system links the order and SKU mismatch.
3. Policy Retrieval finds the wrong-item replacement rule.
4. Resolution Agent recommends immediate replacement without waiting for return receipt.
5. Recovery Agent creates a supplier-facing discrepancy record.
6. Human Review approves the decision.

Scenario A should be the primary story. Scenario B exists only to prove adaptability.

## What makes the project different
Most similar products sit inside one of these categories:
- ticketing/helpdesk,
- returns portals,
- RMA workflows,
- AI support drafting,
- warranty claims systems.

The differentiated angle is the **bridge between customer service and cost recovery**.

That means the product should emphasise:
- multilingual complaint intake,
- evidence completeness checks,
- policy-grounded recommendations,
- customer-facing resolution drafts,
- carrier/supplier recovery generation,
- human approval,
- root-cause analytics.

That is the strongest narrative because it connects service quality with margin protection.

## MVP modules
| Module | MVP behaviour | Why it matters in the demo |
|---|---|---|
| Intake Inbox | Manual or pasted complaint intake with attachments | Makes the workflow start from a realistic messy input |
| Language Detection | Detects customer language and creates internal English summary | Instantly makes the app feel global |
| Case Classifier | Distinguishes damage, wrong item, missing item, defect, return | Gives structure to chaos |
| Order Lookup | Connects case to order, shipment, SKU and carrier | Grounds the case in business context |
| Evidence Checker | Highlights missing proof and next required input | Makes the recommendation explainable |
| Policy Retrieval | Shows the exact rule excerpt behind the recommendation | Builds trust and reduces “black box AI” concerns |
| Resolution Agent | Recommends replacement, refund, credit, escalation or rejection | Produces the customer-side decision |
| Reply Draft | Generates customer-facing text in the original language | Makes the AI value visible |
| Recovery Agent | Generates carrier or supplier recovery draft | Creates the business-side second action |
| Human Review | Approve, edit, request more evidence, reject | Shows control and accountability |
| Analytics | Tracks repeated issue patterns | Demonstrates long-term operational value |
| Audit Timeline | Logs every step and decision | Adds enterprise-style credibility |

## Multi-agent design
Use a visible multi-agent architecture because it performs well in demos and helps judges understand responsibility boundaries.

- **Intake Agent:** extracts case details from raw customer input.
- **Language Agent:** identifies language and prepares an internal English summary.
- **Classification Agent:** identifies the complaint type.
- **Policy Retrieval Agent:** finds the most relevant internal rule.
- **Resolution Agent:** recommends customer action.
- **Recovery Agent:** prepares the carrier or supplier recovery package.
- **Review Gate:** requires a human to approve important outcomes.

This makes the system feel like an operations team, not a single monolithic AI prompt.

## Data model
| Entity | Required fields |
|---|---|
| Customer Case | ID, source, language, customer, order reference, complaint text, case type, status |
| Attachment | Case, file type, image label, confidence, notes |
| Order | Order ID, date, channel, SKU, quantity, value |
| Shipment | Carrier, tracking number, delivery date, warehouse, route |
| Policy Document | Name, version, jurisdiction, type, status |
| Rule | Trigger, requirements, recommended resolution, escalation path |
| Resolution Proposal | Case, recommendation, rationale, confidence, customer impact |
| Recovery Draft | Counterparty, draft text, evidence set, claim amount, status |
| Approval | Reviewer, action, edits, timestamp, outcome |
| Audit Event | Actor, action, previous state, new state, rule source |
| Insight Record | SKU, carrier, supplier, issue type, frequency, trend |

## Decision logic
Do not let the MVP feel magical or legally authoritative. It should feel controlled and inspectable.

Score five factors from 0 to 3:
- evidence completeness,
- policy clarity,
- customer impact,
- business exposure,
- recovery potential.

Route the workflow like this:
- **0–4:** quick review,
- **5–7:** request evidence or supervisor check,
- **8–10:** explicit human approval,
- **11–15:** escalation and no automatic closure.

The point is not “AI decides the law”. The point is “AI structures the case and prepares a controlled recommendation”.

## Luo build prompt
Paste the following in Luo in English:

> Build an internal English-language application called “Claims Resolution & Recovery Hub”. Its purpose is to help small and mid-sized e-commerce teams manage customer complaints, damaged deliveries, wrong-item cases, warranty-related issues and recovery actions against carriers or suppliers from one multilingual workspace.
>
> Create database entities for Customer Cases, Attachments, Orders, Shipments, Policy Documents, Rules, Resolution Proposals, Recovery Drafts, Human Approvals, Audit Events and Insight Records. Build a dashboard that shows open cases, cases waiting for evidence, cases waiting for approval, repeated issue trends, recoverable-value opportunities and recent audit activity.
>
> Create an Intake Inbox where the operator can manually paste or enter a complaint and upload related images. Detect the customer language automatically and create an English internal summary. Add AI-assisted case classification for damaged delivery, wrong item, missing item, withdrawal, defective item and other complaint categories. Show confidence and allow manual correction.
>
> Create an Order Lookup module that links the complaint to order details, SKU, carrier, shipment date and warehouse context. Add an Evidence Checker that identifies whether the case includes the required photos, invoice, tracking number or packaging evidence. If evidence is missing, generate a polite customer follow-up draft in the original language.
>
> Create a Policy Retrieval module that searches uploaded complaint-policy PDFs and internal SOP documents. For every case, show the exact policy excerpt, document name and version used to support the recommendation. Create a Resolution Agent that recommends replacement, refund, partial credit, escalation or rejection. Create a Reply Draft module that writes the customer-facing message in the customer’s language and an internal operator summary in English.
>
> Create a Recovery Agent that prepares a carrier or supplier recovery draft when relevant. The recovery draft must include counterparty, claim type, linked order, linked evidence, summary of issue, estimated recoverable value and next action. Do not connect to any live payment, courier or external claims system. Label the product clearly as “Prototype — human approval required before any external action”.
>
> Use deterministic workflow routing based on five factors scored from 0 to 3: evidence completeness, policy clarity, customer impact, business exposure and recovery potential. Apply these prototype thresholds: 0–4 quick review; 5–7 request evidence or supervisor check; 8–10 explicit human approval required; 11–15 escalation and no automatic closure. Show the factor breakdown in every case.
>
> Create visible AI roles for Intake Agent, Language Agent, Classification Agent, Policy Retrieval Agent, Resolution Agent and Recovery Agent. Add a Human Review inbox with Approve, Approve with edits, Request more evidence and Reject actions. Record all case actions in an append-only audit timeline. Add an analytics view that shows repeated issues by SKU, carrier, supplier and warehouse. Include demo data for a damaged-vase complaint in Spanish and a wrong-item case in English. Add a guided five-minute demo mode.

## 14-day build plan
| Day | Build target | Definition of done |
|---|---|---|
| 1 | Final problem framing | One complaint story, one recovery story, one winning sentence |
| 2 | Data model and case states | Core entities and statuses are stable |
| 3 | Intake Inbox | Complaint can be entered with attachments |
| 4 | Language detection and case classification | App handles multilingual input |
| 5 | Order Lookup | Case links to order, SKU and shipment |
| 6 | Evidence Checker | Missing proof is visible and actionable |
| 7 | Policy Retrieval | Case recommendation cites a visible rule |
| 8 | Resolution Agent and customer draft | Customer outcome is generated |
| 9 | Recovery Agent | Carrier or supplier draft is generated |
| 10 | Human Review | Approvals and edits work cleanly |
| 11 | Audit Timeline | Full chronology is visible |
| 12 | Analytics | Repeated issue patterns appear |
| 13 | Demo mode and screenshots | Demo resets reliably |
| 14 | Pitch rehearsal and backup assets | Project survives outside Luo |

## Hackathon judging message
If asked why this deserves attention, the answer should be:

> This project is not just customer support automation. It is an operational AI system that reduces response time, improves consistency, protects margins through recovery actions and keeps a human accountable for final decisions.

That sentence is important because it reframes the product from “nice-to-have support feature” to “cross-functional operational infrastructure”.

## English pitch

### 30-second version
> Small e-commerce teams often handle damaged deliveries and complaint cases across inboxes, spreadsheets and manual follow-up. Claims Resolution & Recovery Hub turns a messy complaint into a controlled workflow: it detects the language, classifies the issue, checks missing evidence, retrieves the right internal rule, recommends a resolution, drafts the customer reply and prepares a carrier or supplier recovery claim. In our demo, one damaged-order complaint becomes both a customer replacement decision and a recovery package, with a human approving the important steps. The result is faster service, fewer inconsistent decisions and more recovered losses.

### 10-second version
> We turn one complaint into one customer resolution and one recovery action, with AI assistance and human control.

### Tagline
> **Resolve faster. Recover more. Keep humans in control.**

## Success criteria
The sharpened MVP is ready for hackathon use when:
- the problem is obvious in under 20 seconds,
- the main demo story runs without manual fixes,
- the customer reply and recovery draft are both generated from the same case,
- the recommendation cites a visible policy source,
- the human review step is clear and meaningful,
- the analytics page shows at least one repeated root cause,
- the product feels like a workflow system, not a prompt demo,
- the same concept can be rethemed for logistics, AI, retail or SME events.

## Main risks
- **Too much scope:** keep the MVP to one flagship scenario and one backup scenario.
- **Weak differentiation:** avoid presenting it as “AI for returns”.
- **Too much legal language:** this is decision support, not automated legal adjudication.
- **Black-box output:** every recommendation must show evidence and rule source.
- **No second action:** if you skip carrier or supplier recovery, the concept loses its strongest edge.
- **Over-automation:** do not remove human approval from financially or reputationally meaningful actions.

## Recommended next step
Build the product around a single headline story:

> **“A Spanish complaint about a broken vase becomes a customer replacement and a carrier recovery claim in under one minute.”**

That is the clearest, most visual and most memorable demo narrative. Everything in the MVP should exist to make that sentence true on stage.
