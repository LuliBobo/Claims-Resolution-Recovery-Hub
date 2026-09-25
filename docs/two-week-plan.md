# Two-week build plan

Tracks the plan from `docs/concept.md`. Check items off as they're done in Luo (or here, for the GitHub-side assets).

- [x] **Day 1** — Product narrative and scope: one persona, one complaint story, one recovery story (`docs/prd.md`, `docs/pitch.md`)
- [x] **Day 2** — Core data model: cases, orders, shipments and approvals defined (`schema/`)
- [ ] **Day 3** — Intake Inbox and case detail: new complaint can be registered manually (in Luo)
- [ ] **Day 4** — Case classification: main complaint types are distinguishable (in Luo)
- [ ] **Day 5** — Order Lookup and shipment context: complaint links to order and carrier data (in Luo)
- [ ] **Day 6** — Evidence Checker: missing documents and photos are identified (in Luo)
- [ ] **Day 7** — Policy Retrieval: uploaded PDF rules appear in case context (in Luo; seed with `demo-data/policy-documents/`)
- [ ] **Day 8** — Resolution proposal and reply draft: customer-facing recommendation is generated (in Luo)
- [ ] **Day 9** — Recovery draft workflow: carrier or supplier claim draft is created (in Luo)
- [ ] **Day 10** — Human Review and audit timeline: approvals and edits logged chronologically (in Luo)
- [ ] **Day 11** — Analytics and root-cause view: repeated SKU/carrier issues are visible (in Luo)
- [ ] **Day 12** — Guided demo mode: demo resets to known sample cases (seed from `demo-data/cases/`)
- [x] **Day 13** — GitHub documentation: schema, rules and prompt assets stored outside Luo (this repo)
- [ ] **Day 14** — Pitch, screenshots and portability test: core concept survives outside Luo

## Recommended build order inside Luo

Follow `docs/claimflow-luo-playbook.md` Phase 1 → 5 as the canonical sequence (this is what the live Luo build was actually seeded from). Build only the **damaged-vase complaint story** first (`demo-data/cases/damaged-vase.json`, Elena Rostova / DPD, English). Once the full path — intake, classify, verify evidence, retrieve policy, propose replacement, draft carrier recovery, approve, record — works end to end, add the **wrong-item** story (`demo-data/cases/wrong-item.json`, Martin Horvath, Slovak — no carrier claim, internal warehouse flag only).

`docs/luo-modular-prompts.md` is a more granular 16-step alternative if a single Phase-1 prompt overbuilds or misnames fields in Luo.
