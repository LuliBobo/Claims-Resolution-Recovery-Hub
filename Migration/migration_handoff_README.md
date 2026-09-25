# Claims Resolution & Recovery Hub — Migration Inventory & GitHub Handoff Package

Generated as a **read-only** inventory of the live workspace. No spec changes, builds, record
mutations, approvals, sends, or GitHub actions were performed to produce this package.

## Labeling convention (used throughout every document in this package)

- **VERIFIED** — confirmed directly against the live database (`run_sql`), the live spec
  (`query_spec`), the live build status, or the actual generated source code (via a read-only
  code-inspection pass). Reproducible by re-running the same read-only query.
- **INFERRED** — a reasonable conclusion drawn from verified evidence (e.g. correlating an audit
  log entry's timing with a database row) but not itself directly stored or asserted anywhere.
  Always stated with the reasoning behind it.
- **UNKNOWN / UNVERIFIED** — could not be established with the tools available (e.g. no API
  exists to inspect binary blob storage from this session). Never guessed or filled in.

## Folder structure

```
migration_handoff/
├── README.md                                    (this file)
├── PUBLIC_REPOSITORY_REVIEW.md                   INTERNAL ONLY — sensitivity checklist, do not publish
├── internal/                                     Full detail, includes case-level personal data — do not publish as-is
│   ├── 01_verified_inventory.md
│   ├── 02_business_rules_and_workflows.md
│   ├── 03_ui_inventory.md
│   ├── 04_data_dictionary.md
│   ├── 05_migration_dependencies.md
│   ├── 06_acceptance_tests.md
│   └── 07_case_inventory_elena_rostova_INTERNAL_ONLY.md   (contains real-looking customer PII — never publish)
└── public/                                       Sanitized versions safe to place in a public GitHub repo
    ├── 01_verified_inventory.md
    ├── 02_business_rules_and_workflows.md
    ├── 03_ui_inventory.md
    ├── 04_data_dictionary.md
    ├── 05_migration_dependencies.md
    └── 06_acceptance_tests.md
```

The `public/` set intentionally excludes: the case-specific inventory, all raw database rows,
customer names/emails, order references, tracking numbers, and attachment filenames. It uses
schema-level and rule-level descriptions only. Review `PUBLIC_REPOSITORY_REVIEW.md` before
copying anything else into a public repository.

## Source of truth for this package

- Live spec ID: `7873ba21-eb4f-4d13-a357-bd20a62a4c8a`
- Live build ID: `79cffdd2-5b98-48d9-8dbd-128632757d52` — **VERIFIED**: `STATUS_DONE`, `success: true`
- Database: workspace Postgres, queried directly and read-only (`SELECT` only)
- Code inspection: a read-only pass over the generated build source for `deleteAttachment`
  (see `internal/01_verified_inventory.md` §6)

Nothing in this package was pushed anywhere. All files are local artifacts awaiting your review.
