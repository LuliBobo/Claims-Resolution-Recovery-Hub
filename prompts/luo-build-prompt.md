# Luo build prompt(s)

**Primary source:** `docs/claimflow-luo-playbook.md`. Its Phase 1 "Master Initialization Prompt" is the exact prompt to paste first into Luo, and it is what the current live Luo build was actually seeded from (its Seed Scenario 1 — Elena Rostova, order #ORD-9842, DPD — matches the flagship case confirmed present in the live Luo database). Treat that document, not this file, as the canonical build sequence: Phase 1 (init) → Phase 2 (refinement prompts 2.1–2.3) → Phase 3 (seed scenarios 3.1–3.2) → Phase 4 (analytics) → Phase 5 (demo script).

**Alternative, more granular source:** `docs/luo-modular-prompts.md` — 16 separate prompts, one module at a time, with richer per-field detail (e.g. Internal English Summary, Priority, Recovery Needed) than the playbook's leaner entity list. Use this if the playbook's single large Phase 1 prompt causes Luo to overbuild or misname fields, or if a module needs to be refined further than the playbook's phases cover — but note its exact field names don't match `schema/` 1:1 (see caveat below).

## Schema alignment note

`schema/*.json` in this repo now mirrors `docs/claimflow-luo-playbook.md`'s entity list exactly (10 entities — no separate "Rule" entity; rule content lives in Policy Documents' Content Summary). If you use `docs/luo-modular-prompts.md` instead or in addition, its field names (e.g. "Priority", "Assigned Reviewer", "Internal English Summary" as a stored Customer Case field) are additive extras beyond the playbook/schema baseline, not a replacement for it — add them as extra fields in Luo if wanted, but don't let them replace the canonical field names already listed in `schema/`.

## Seeding Luo with the prototype assets already in this repo

When Luo asks for policy documents or sample cases, use the files already prepared here instead of writing them from scratch inside Luo:

- Sample cases (real seed data, matching what's already live in Luo): `demo-data/cases/damaged-vase.json` (Elena Rostova, #CAS-2026-089), `demo-data/cases/wrong-item.json` (Martin Horvath, #CAS-2026-090)
- Policy excerpts: `demo-data/policy-documents/`
- Decision-routing overlay (five-factor scoring, optional on top of the base entities): `rules/decision-rules.yaml`
- Reply templates: `i18n/reply-templates/`

Keeping Luo's seed data in sync with these files means the demo data survives if the Luo workspace becomes unavailable. If you change something directly in Luo (e.g. via prompts in the playbook's Phase 3), mirror the change back into these JSON files so they don't drift apart again.

## Known open items from the playbook itself

- The playbook's own approval-gate wording (Step 2.3: "Approve Both & Dispatch" / "Edit Drafts" / "Reject / Escalate") doesn't exactly match its own Phase 1 `Human Approvals.Decision` field values (`Approved`, `Approved With Edits`, `Rejected`). `schema/approval.schema.json` documents the intended mapping between the two.
- The playbook's Seed Scenario 2 (Martin Horvath / wrong item) explicitly has **no carrier claim** — it's an internal warehouse-discrepancy flag, not a Recovery Draft. Don't force-create a Recovery Draft record for that case.
