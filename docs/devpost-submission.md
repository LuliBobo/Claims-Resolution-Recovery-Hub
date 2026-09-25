# Claims Resolution & Recovery Hub — Devpost Submission

> **Adapted note:** the original draft used a Spanish-language flagship complaint and an older resolution-options list (partial credit / escalation). The flagship case actually built in Luo (Elena Rostova, order #ORD-9842, DPD) is in English, and the live schema's recommended-action values are replacement / refund / store credit / reject (see `docs/claimflow-luo-playbook.md`, `schema/resolution-proposal.schema.json`). Both are corrected below. Fill in "Built with" sponsor tools, live demo link, and screenshots before actually submitting — those are still placeholders.

## Project name
**Claims Resolution & Recovery Hub**

## Tagline
**Resolve faster. Recover more. Keep humans in control.**

## Short description
Claims Resolution & Recovery Hub is a multilingual complaint-to-recovery workflow for small and mid-sized e-commerce teams. It turns one customer complaint into a policy-supported customer resolution and a carrier or supplier recovery action, with human approval before anything important happens.

## The problem
Small e-commerce teams often handle damaged deliveries, wrong-item cases, missing items and returns through shared inboxes, spreadsheets and manual follow-up. The support operator must identify the order, understand the complaint, request missing evidence, check internal rules, coordinate with the warehouse and decide what to tell the customer.

A second problem is easy to miss: even after resolving the customer’s issue, the merchant may fail to recover the loss from the carrier or supplier. The result is slower support, inconsistent decisions and avoidable margin loss.

## What we built
Claims Resolution & Recovery Hub creates one operational case from the incoming complaint and coordinates the next steps across the customer, e-commerce team, warehouse context, carrier and supplier.

The MVP can:

- detect the customer’s language and create an internal English summary,
- classify the complaint as damaged delivery, wrong item, missing item, defective product or return request,
- connect the case to order, SKU, shipment, warehouse and carrier information,
- check whether the required evidence is present,
- retrieve relevant internal policy guidance,
- recommend a customer resolution,
- draft a reply in the customer’s language,
- prepare a carrier or supplier recovery draft,
- route important actions to human approval,
- record decisions in an audit timeline,
- surface repeated issues by SKU, supplier or carrier.

## How it works
A customer submits a complaint with a short message and photos. The Intake and Language Agents structure the input. The Classification Agent identifies the case type. Order Lookup adds business context, while the Evidence Checker identifies missing information.

The Policy Retrieval Agent searches uploaded internal policy documents and shows the rule supporting the recommendation. The Resolution Agent proposes a customer outcome such as replacement, refund, store credit or rejection. The Reply Draft module prepares customer communication in the original language and an internal English summary.

When a carrier or supplier may be responsible, the Recovery Agent creates a separate recovery draft with the counterparty, issue summary, evidence links and estimated recoverable value. A human reviewer can approve, edit, request more evidence or reject the proposed actions. Every important event is recorded in the audit timeline.

## The demo
Our flagship demo starts with a complaint about a broken glass vase.

In under one minute, the system:

1. detects the customer's language and creates an English internal summary,
2. links the complaint to the order and shipment,
3. classifies it as shipping damage,
4. identifies that the product photo is present but the outer-box photo is missing,
5. retrieves the relevant internal policy,
6. recommends sending a replacement,
7. drafts a customer reply in the customer's language,
8. prepares a carrier recovery claim in English,
9. routes both actions to human approval,
10. records the full decision trail.

The key demonstration is simple:

> **One complaint in, two controlled outcomes out.**

## Why it is different
This is not only an AI customer-support writer and not a full helpdesk replacement. The core workflow connects the customer-facing decision with the business-facing recovery action.

The product is designed around five principles:

- **Evidence before action:** recommendations should identify missing proof.
- **Policy-supported decisions:** the operator can see which internal rule supports the proposal.
- **Multilingual by default:** customers can communicate in their own language while the operations team works from an English summary.
- **Human control:** actions affecting money, liability or customer outcomes require review.
- **Recovery and prevention:** the system helps recover losses and identify repeated operational failures.

## Built with
- Luo
- AI-assisted document and image analysis
- Multilingual text generation
- Structured workflow and database entities
- Human-in-the-loop approval workflow
- Policy document retrieval
- Audit timeline
- Synthetic demo data

Add the event-specific sponsor technologies and APIs here before submitting. Do not list a tool unless it was actually used in the project.

## Responsible use and limitations
This MVP is decision support, not legal advice and not an automated legal adjudication system. It does not automatically issue refunds, contact carriers, change orders or execute external actions. Important actions require human approval.

The policy module uses the merchant’s uploaded internal documents. Rules and workflow thresholds are prototype assumptions and must be adapted and reviewed before use in a real country, sector or legal context.

## What we learned
The main product lesson was that complaint automation becomes more valuable when it connects service quality with financial recovery. Generating a customer reply is useful, but the stronger workflow continues to the carrier or supplier and records the reason for every decision.

The main technical lesson was to separate AI recommendations from deterministic workflow controls. The model can structure information and explain options, but the workflow should decide when evidence is missing, when a human must review the case and when automatic closure is not allowed.

## Future development
- Native integrations with Shopify, WooCommerce, Shoptet and helpdesk tools.
- Direct integrations with WMS, ERP and carrier claim portals.
- Country-specific policy and language packs.
- Supplier and carrier scorecards.
- Automatic detection of recurring product and packaging failures.
- Recovery-rate and avoided-loss analytics.
- Role-based approvals and multi-step escalation.
- Portable API and open integration layer outside Luo.

## Expected impact
For small e-commerce teams, the product aims to reduce manual case handling, improve consistency, shorten response time and prevent recoverable losses from disappearing into operational overhead.

For customers, the intended benefit is clearer and faster communication in their own language. For merchants, the intended benefit is a traceable workflow that connects complaint resolution, evidence, approval and recovery.

## Try it out
**Live demo:** Add public Luo demo link here if available.

**Demo account:** Add a safe test account here if required.

**Source repository:** Add GitHub or other public repository link here.

## Video demo
The recommended video length is approximately 3 minutes. It should show the product in action rather than only presenting slides:

1. problem and target user,
2. dashboard,
3. damaged-vase complaint,
4. evidence check,
5. policy support,
6. customer resolution draft,
7. carrier recovery draft,
8. human approval,
9. audit timeline,
10. closing impact statement.

## Suggested video closing
> Claims Resolution & Recovery Hub turns one customer complaint into an explainable customer resolution and a recovery action, with multilingual AI support and human approval built in.

## Screenshot checklist
Prepare at least these screenshots:

1. Dashboard with open cases, approval queue and recovery opportunities.
2. Case detail showing the complaint, order context and evidence checklist.
3. Policy-supported resolution proposal.
4. Carrier or supplier recovery draft.
5. Human approval queue and audit timeline.
6. Analytics showing repeated issues by SKU, supplier or carrier.

## Submission checklist
Before submitting to a hackathon, verify:

- project name and tagline are final,
- the written description explains the problem, product and demo,
- required sponsor tools and APIs are listed,
- all required integrations are actually used,
- public demo link works,
- source repository is accessible if required,
- README includes setup and test instructions,
- demo video is publicly viewable,
- screenshots show the product in action,
- the project follows the event’s theme and rules,
- the live demo uses synthetic data only,
- all external actions are clearly marked as simulated or human-approved.

Devpost’s own submission guidance commonly asks for a project story, built-with tags, try-it-out links, screenshots and a public video; individual hackathon rules may add source-code, sponsor-tool or duration requirements. Always check the specific event rules before final submission.
