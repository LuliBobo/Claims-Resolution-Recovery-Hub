# Claims Resolution & Recovery Hub (app)

Next.js (App Router) + TypeScript + PostgreSQL (Prisma) + Auth.js + shadcn-style UI.
This is the Claude Code rebuild of the verified Luo prototype. The source spec lives in
`../Migration/` and `../claims-resolution-hub-multiple-proposal-supersession-migration-requirement.md`;
the build plan is `IMPLEMENTATION_PLAN.md`.

## Run locally

```bash
cp .env.example .env            # then set AUTH_SECRET (openssl rand -base64 32)
docker compose up -d            # or point DATABASE_URL at any Postgres 16
npm install
npx prisma migrate deploy
npm run db:seed                 # users, policies, rules + the synthetic sample cases
npm run dev
```

Seeded logins (password `changeme-dev`, or `SEED_PASSWORD`): `agent@example.com`,
`reviewer@example.com`, `admin@example.com`. Set `SEED_SKIP_SAMPLES=1` to skip the sample cases.
Without `ANTHROPIC_API_KEY` the app still works: AI steps fail gracefully and cases are flagged
"needs triage".

## Tests

| Command | What |
|---|---|
| `npm test` | Unit + integration (real Postgres, `TEST_DATABASE_URL`, migrated automatically) |
| `npm run test:e2e` | Playwright happy path in a real browser, own DB (`E2E_DATABASE_URL`), fake LLM |

E2E needs a Chromium: `npx playwright install chromium`, or `PW_CHROMIUM_PATH=/path/to/chrome`.
`E2E_FAKE_LLM=1` swaps the Anthropic API for deterministic answers (refused when `VERCEL_ENV=production`).

## Architecture rules

- `src/app` holds pages and route handlers only; `src/actions` are thin Server Actions;
  `src/server` is the framework-agnostic domain layer. Cron routes and UI call the same functions.
- The evidence gate (`src/server/evidence/carrier-claims-gate.ts`) is pure, has no LLM dependency,
  is recomputed from current attachments on every use, and only overwrites `recommendation`.
- "Evidence present" always means `Attachment.evidenceStatus === "sufficient"`.
- `regenerateResolutionProposal`, review, mark-sent and reconcile all take a
  `SELECT ... FOR UPDATE` lock on the `CustomerCase` row first, so a case never has two live proposals.
- `AuditEvent` is append-only (database trigger). `HumanApproval` link columns are enforced by a CHECK.

## Deploying (Vercel)

See [DEPLOY.md](DEPLOY.md): project setup, environment variables, first admin, verification and
limits. Still open before relying on it: the AI prompts have only been run against mocked responses
(try a few real complaints and photos with a real `ANTHROPIC_API_KEY` first), and the Vercel
deployment itself has not been run from here.

## Known decisions and limitations

- Policy/rule editing is limited to reviewer/admin; manual job triggers likewise.
- Insight `frequency` is all-time per group; trend compares the last 30 days with the 30 before.
- Photo subject (item vs outer carton) is set by the evidence judge from image content, not file name.
- Workflow scoring (concept Prompt 12) is implemented in `src/server/scoring/`: five factors 0-3, total
  0-15, four routes. It is pure, recomputed from current data on every read, and shown on the case page
  and the approvals queue. Derivations and thresholds are prototype assumptions (documented in
  `workflow-score.ts`). Reviewers/admins can override a factor with a reason (audited). The only
  enforcement: on the "escalate" route (11-15) an agent cannot move a case to resolved/closed.
- Review actions (queue and case page): Approve, Approve with edits, Request more evidence, Reject.
  *Approve with edits* keeps the decision `approved` (so every guard downstream is unchanged) and stores
  `{field: {from, to}}` on the approval, so the original is never lost; only recommendation, rationale and
  customer reply (proposals) or claim type, text and value (drafts) are editable, and a recommendation edit
  is refused while the evidence gate applies and is incomplete. *Request more evidence* needs a comment,
  is a recorded human decision of its own (`evidence_requested`, never `rejected`), makes the item
  non-live and non-sendable, and is replaced by the next regeneration. It does not change the case status
  and does not draft a message to the customer.
- Not built from the original concept doc: PDF policy retrieval with excerpts, guided demo mode,
  a generated customer message asking for missing evidence.
