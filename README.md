# Claims Resolution & Recovery Hub

Multilingual operations hub that helps small and mid-sized e-commerce teams turn a customer complaint (return, damaged delivery, warranty claim) into a fast, consistent and recoverable decision — across the customer, warehouse, carrier and supplier.

> **Resolve faster. Recover more. Keep humans in control.**

## Status

Prototype is being built in [Luo](https://luo.app) (2-week free trial). This repository holds everything that must survive independently of Luo: product requirements, data schema, decision rules, sample demo data, Luo build prompts and pitch assets.

The flagship demo case (**Elena Rostova**, order **#ORD-9842**, carrier **DPD**, English-language complaint about a shattered glass vase) is already live in the Luo workspace. `schema/`, `demo-data/`, and `prompts/luo-build-prompt.md` in this repo have been reconciled to match that real build — see `docs/claimflow-luo-playbook.md`, which is the document the live build was actually seeded from.

## Source documents in `docs/`

Several concept/pitch documents accumulated during the build; they are not all mutually consistent (different entity field names, one flagship-language choice vs. another). `docs/claimflow-luo-playbook.md` is treated as authoritative for the **data schema and build sequence** because it matches what is actually live in Luo. `docs/spoken-pitch.md` and `docs/demo-script.md` are the **adapted, English-language pitch/demo assets** actually meant for use (their originals used a Spanish flagship complaint; see the adapted-note at the top of each file). `docs/concept.md`, `docs/concept-sharpened.md` and `docs/luo-modular-prompts.md` are kept as original source material for rationale and as an alternative, more granular build path — read their own adapted-notes before relying on specifics that differ from the playbook.

## Why this repo exists outside Luo

Luo is the **prototype environment, not the permanent technical foundation**. Per `docs/concept.md`'s "Portability beyond Luo" section, the following must be stored outside the workspace from day one:

- Product requirements and architecture — `docs/`
- Data schema — `schema/` (JSON Schema, matches `docs/claimflow-luo-playbook.md`)
- Decision rules — `rules/decision-rules.yaml`
- Sample complaint scenarios (the real seed data, not placeholders) — `demo-data/cases/`
- Demo translations and reply templates — `i18n/`
- Policy excerpts and test documents — `demo-data/policy-documents/`
- Luo build prompts — `prompts/luo-build-prompt.md`
- Pitch and demo script — `docs/pitch.md`, `docs/spoken-pitch.md`, `docs/demo-script.md`

## Repository layout

```
docs/
  concept.md                  Original MVP concept (source document)
  concept-sharpened.md        Sharpened positioning (source document, Spanish-flagship original)
  claimflow-luo-playbook.md   Authoritative Luo build sequence + entity schema (matches live build)
  luo-modular-prompts.md      Alternative 16-step granular build path (source document)
  spoken-pitch.md             Adapted spoken pitch (English flagship)
  demo-script.md              Adapted screen-by-screen demo script (English flagship)
  prd.md                      Product requirements (modules, personas, demo flow)
  architecture.md             Multi-agent design and workflow
  two-week-plan.md            Build plan with a live checklist
  pitch.md                    Pitch index, tagline, success criteria
schema/                       JSON Schema for every data entity (10 entities, per the playbook)
rules/decision-rules.yaml     Five-factor scoring + workflow routing thresholds (overlay, optional)
demo-data/
  cases/                      Real seed cases: damaged-vase.json (Elena Rostova/DPD), wrong-item.json (Martin Horvath)
  policy-documents/           Sample internal policy / carrier-claim excerpts
i18n/reply-templates/         Sample multilingual customer-reply templates
prompts/luo-build-prompt.md   How the Luo build prompts in docs/ relate, and how to reseed from this repo
```

## First build target

Build only the **damaged-vase complaint story** first (intake → classify → verify evidence → retrieve policy → propose replacement → draft carrier recovery → approve → record) — this is already live in Luo. Add the second story (wrong-item, Slovak, no carrier claim) once the first path is solid end to end.

## Disclaimer

Prototype only. No live courier, payment or ERP integrations. No legal or regulatory automation — decision thresholds in `rules/decision-rules.yaml` are prototype assumptions for demonstration, not legal standards.
