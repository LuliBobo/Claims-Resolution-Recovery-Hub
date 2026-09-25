# Architecture — multi-agent design

## Agent roles

| Agent | Responsibility |
|---|---|
| Intake Agent | Parses incoming complaints, attachments and customer language |
| Classification Agent | Determines case type and initial severity |
| Policy Retrieval Agent | Extracts relevant internal rules from uploaded documents |
| Resolution Agent | Proposes the customer-facing outcome and reply draft |
| Recovery Agent | Prepares the downstream carrier or supplier recovery package |

Agents recommend and assemble information. **Deterministic workflow rules decide** whether a case can proceed automatically, needs missing evidence, or must be escalated — see `rules/decision-rules.yaml`. A human is accountable for every final action that affects money, liability or customer rights.

## Data flow

```
Complaint (email/form + photos)
  -> Intake Agent            captures CustomerCase + Attachments
  -> Classification Agent    sets caseType + classificationConfidence
  -> Order Lookup            links Order + Shipment
  -> Evidence Checker        compares Attachments against Rule.evidenceRequirement
       |-- missing evidence -> customer evidence request, case stays "awaiting_evidence"
  -> Policy Retrieval Agent  finds matching Rule + PolicyDocument excerpt
  -> Resolution Agent        creates ResolutionProposal (with factorScores + workflowPath)
  -> Recovery Agent          creates RecoveryDraft, if recovery-eligible
  -> Human Review            records Approval (approve / approve_with_edits / request_more_evidence / reject)
  -> Audit Event             append-only log of every state change
  -> Ops Analytics           aggregates into InsightRecord (SKU/carrier/supplier trends)
```

## Workflow routing (deterministic, not model-controlled)

Score five factors 0-3 each (evidence completeness, policy clarity, customer impact, business exposure, recovery potential); total 0-15 selects the path. Full definition: `rules/decision-rules.yaml`.

| Score | Path |
|---|---|
| 0-4 | Quick review |
| 5-7 | Evidence completion or supervisor check |
| 8-10 | Explicit human approval required |
| 11-15 | Escalate, block auto-closure |

Every ResolutionProposal must display: the five factor scores, the policy source (document + excerpt + rule version), and any missing information. No model output may bypass this routing.

## Data model

Entities and required fields are defined as JSON Schema in `schema/`: `customer-case`, `attachment`, `order`, `shipment`, `policy-document`, `rule`, `resolution-proposal`, `recovery-draft`, `approval`, `audit-event`, `insight-record`.

## Guardrails

- Mark the system clearly as "Prototype — human approval required before any external action."
- Do not connect to any live courier or payment system in the MVP.
- Decision thresholds are prototype assumptions for demonstration, not legal or regulatory standards.
