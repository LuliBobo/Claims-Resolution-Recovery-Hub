# Claims Resolution & Recovery Hub

Multilingual operations hub that helps small and mid-sized e-commerce teams turn a customer complaint (return, damaged delivery, warranty claim) into a fast, consistent and recoverable decision — across the customer, warehouse, carrier and supplier.

> **Resolve faster. Recover more. Keep humans in control.**

## Status

Prototype is being built in [Luo](https://luo.app) (2-week free trial). This repository holds everything that must survive independently of Luo: product requirements, data schema, decision rules, sample demo data, the Luo build prompt and pitch assets.

Concept source: `docs/concept.md` (original hackathon MVP concept this project is based on).

## Why this repo exists outside Luo

Luo is the **prototype environment, not the permanent technical foundation**. Per the concept's "Portability beyond Luo" section, the following must be stored outside the workspace from day one:

- Product requirements and architecture — `docs/`
- Data schema — `schema/` (JSON Schema)
- Decision rules — `rules/decision-rules.yaml`
- Sample complaint scenarios — `demo-data/cases/`
- Demo translations and reply templates — `i18n/`
- Policy excerpts and test documents — `demo-data/policy-documents/`
- The exact Luo build prompt — `prompts/luo-build-prompt.md`
- Pitch — `docs/pitch.md`

## Repository layout

```
docs/
  concept.md              Original MVP concept (source document)
  prd.md                  Product requirements (modules, personas, demo flow)
  architecture.md          Multi-agent design and workflow
  two-week-plan.md         Build plan with a live checklist
  pitch.md                 30-second pitch, tagline, success criteria
schema/                    JSON Schema for every data entity
rules/decision-rules.yaml  Five-factor scoring + workflow routing thresholds
demo-data/
  cases/                   Damaged-vase and wrong-item sample cases
  policy-documents/        Sample internal policy / carrier-claim excerpts
i18n/reply-templates/      Sample multilingual customer-reply templates
prompts/luo-build-prompt.md  Exact prompt to paste into Luo
```

## First build target

Per the concept's recommended next step: build only the **damaged-vase complaint story** first (intake → classify → verify evidence → retrieve policy → propose replacement → draft carrier recovery → approve → record). Add a second story (wrong-item) only once that path works end to end.

## Disclaimer

Prototype only. No live courier, payment or ERP integrations. No legal or regulatory automation — decision thresholds in `rules/decision-rules.yaml` are prototype assumptions for demonstration, not legal standards.
