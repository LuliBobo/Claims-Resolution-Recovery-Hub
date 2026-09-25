# Claims Resolution & Recovery Hub — public migration reference

Snapshot date: 2026-09-25. Source: Luo workspace inventory supplied by the project owner. This is documentation for rebuilding the application, **not** an export of source code, database records, or attachment binaries. The seven documents in this set are intended for a public repository only after owner review.

## Contents

1. `01_verified_inventory.md` — entities, relationships, components, known limits.
2. `02_business_rules_and_workflows.md` — observed behaviour and evidence gates.
3. `03_ui_inventory.md` — screens and interactions.
4. `04_data_dictionary.md` — confirmed enum values and limitations of available field documentation.
5. `05_migration_dependencies.md` — order of reconstruction and data migration.
6. `06_acceptance_tests.md` — target-system test checklist; unchecked tests are not claims of execution.

## Evidence and currency

The original Luo inventory reported a successful deployed build and live schema inspection. **After that snapshot**, the owner supplied a Luo Assistant report that a subsequent build removed the one-off UUID deletion exception; the current deployed handler was reported to permit deletion only when `file_name` begins with `test_` or `synthetic_` (case-sensitive). The new build ID was not supplied, and this package was not independently checked against Luo. Where relevant, the documents distinguish original inventory observations from this subsequent reported change. Inspect the current workspace before relying on this material in production.

No GitHub integration, source-code export, or data migration is evidenced by these documents. No personal records, internal case inventories, database dumps, credentials, or internal sensitivity-review file are included. Do not copy raw Luo exports into a public repository. Keep internal materials in access-controlled storage outside this repository.

## Note on this repo's schema/ vs. this inventory

`schema/*.json` in this repository was built from `docs/claimflow-luo-playbook.md` (a build *prompt*, describing intent). This migration set was produced from a **live code/schema inspection** of the actual deployed build, and reports materially different field names and enum values in several entities (e.g. `CustomerCase.priority` vs. this repo's `severity`, `ResolutionProposal.status`/`customer_impact`/`business_exposure`/`policy_source` not present in `schema/resolution-proposal.schema.json`, `HumanApproval.decision` having no `approved_with_edits` value here). `schema/` has not yet been reconciled against this newer, more authoritative source — treat `schema/` as describing the intended/target shape from the playbook, and this migration set as the more current record of what's actually deployed, until they're reconciled.
