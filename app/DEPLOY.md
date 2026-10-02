# Deploying to Vercel

Everything here was rehearsed locally (clean clone, `npm ci`, `vercel-build` against an empty
database, `next start`, first admin, health check, sign-in). It has **not** been run on Vercel
itself: no Vercel account was available while this was prepared. Items marked *verify* are from
memory of Vercel's documented behaviour and worth a quick check against the current docs.

## 1. Prerequisites

- A Vercel project connected to this GitHub repository.
- A Postgres 16 database reachable from Vercel (Neon, Supabase, Vercel's Marketplace Postgres, ...).
  You need **two** connection strings if the provider offers a pooler: a *pooled* one for the app and
  a *direct* one for migrations. Transaction-mode pooling is fine (all locks used are
  transaction-scoped).
- An Anthropic API key.

## 2. Create the project

1. Import the repo. **Root Directory: `app`** (the Next.js app is not at the repo root).
2. Framework preset: Next.js (auto-detected). Leave Install/Build commands empty: Vercel runs the
   `vercel-build` script from `package.json` *(verify)*, which is
   `prisma migrate deploy` (only for Production builds, or when `RUN_MIGRATIONS=1`) followed by `next build`.
   Preview deployments therefore never touch the database unless you opt in.
3. Optionally set *Settings > Functions > Region* to the region closest to your database.

## 3. Environment variables (Production)

| Variable | Value |
|---|---|
| `DATABASE_URL` | pooled connection string |
| `DIRECT_DATABASE_URL` | direct connection string (used by migrations) |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `CRON_SECRET` | `openssl rand -base64 32` (Vercel Cron sends it as `Authorization: Bearer ...` automatically) |
| `ANTHROPIC_API_KEY` | your key |
| `ANTHROPIC_MODEL` | optional, defaults to `claude-sonnet-5-5` |
| `MAX_UPLOAD_MB` | optional, default `4` (see limits) |

Do **not** set `E2E_FAKE_LLM`, `SEED_*` or `NEW_USER_PASSWORD` on Vercel. `AUTH_URL` / `AUTH_TRUST_HOST`
are not needed on Vercel. For Preview deployments either give them their own database or leave
`DATABASE_URL` unset (the build still succeeds; pages that need data will error).

## 4. First deploy

1. Deploy. The Production build applies all migrations.
2. From your machine (not Vercel), create the first admin against the production database. Use the
   **direct** URL and a password of at least 12 characters, passed via the environment:

   ```bash
   cd app
   DATABASE_URL='<direct url>' NEW_USER_PASSWORD='<long password>' \
     npm run user:create -- you@company.com "Your Name" admin
   ```
   Omit `NEW_USER_PASSWORD` to have a strong random one generated and printed once. Re-running the
   command for the same email changes that user's role and password. Create reviewers and agents the
   same way.
3. Load the starter policies and rules (the three default documents, including the exactly named
   `DPD Carrier Claims SOP` the evidence gate matches, and three rules). Edit them afterwards under
   *Policy & Rules*:

   ```bash
   DATABASE_URL='<direct url>' SEED_SKIP_USERS=1 SEED_SKIP_SAMPLES=1 npx prisma db seed
   ```
   Never run the seed without `SEED_SKIP_USERS=1` against production unless you set your own
   `SEED_PASSWORD`; it refuses to create demo users with the default password when it detects a
   production environment, and it skips the synthetic sample cases there unless `SEED_ALLOW_SAMPLES=1`.

## 5. Verify the deployment

```bash
BASE=https://<your-domain>
curl -s $BASE/api/health                                   # {"status":"ok","database":true}
curl -s -H "Authorization: Bearer $CRON_SECRET" $BASE/api/health
# {"status":"ok","checks":{"database":true,"authSecret":true,"cronSecret":true,"anthropicKey":true,"fakeLlmOff":true}}
```

Any `false` is a misconfiguration (a 503 means `database`, `authSecret` or `fakeLlmOff` failed). Then,
in the browser:

1. Sign in as the admin. Open *Orders* and *Shipments* and add one of each.
2. Create a case in a language other than English, linked to that order/shipment, with *Recovery
   needed* ticked. A healthy AI setup gives it a language, English summary, type, priority and
   confidence, a resolution proposal and a recovery draft, and does **not** show the "AI triage step
   failed" banner. If it does, check `ANTHROPIC_API_KEY` and the audit trail (`llm_step_failed` rows
   include the error).
3. Upload a real photo of damage. Its row should show an evidence status and AI notes (not stuck on
   `pending_review`), and the download link should return the same file.
4. Trigger both jobs once by hand:

   ```bash
   curl -s -H "Authorization: Bearer $CRON_SECRET" $BASE/api/cron/recompute-insights
   curl -s -H "Authorization: Bearer $CRON_SECRET" $BASE/api/cron/weekly-report
   ```

## 6. Things to know

- **Cron.** `vercel.json` schedules insights nightly (02:00 UTC) and the weekly report Mondays (06:00 UTC).
  Hobby plans allow cron jobs once per day at most *(verify)*, which these satisfy. Cron runs only on
  Production deployments.
- **Uploads are capped at 4 MB** by default. Vercel documents a request-body limit of about 4.5 MB for
  functions *(verify for your plan)*, and the Claude API limits image size, so larger photos could be
  stored but fail AI judging and stay `pending_review`. Files live in Postgres, so database size and
  backups include them.
- **Function time.** Pages that trigger AI work export `maxDuration = 60`. Creating a case makes up to
  four sequential AI calls; if your plan caps functions below that, case creation can time out. The case
  itself is saved first, so a timeout leaves a case flagged for manual triage rather than losing it.
- **Sign-in throttling.** Five failed sign-ins for one email within 15 minutes lock that email for the
  window, even for the right password (per email, not per IP: an attacker can temporarily lock a known
  address). Failures for unknown emails count the same way, so the response never reveals which
  accounts exist.
- **Not included:** a Content-Security-Policy header (the other security headers are set in
  `next.config.ts`), email or any outbound messaging ("sent" is a manual attestation), password
  reset, and multi-factor sign-in.
- **Rollbacks.** Vercel's instant rollback does not undo database migrations. Keep migrations additive
  and backwards compatible with the previous deployment.
- **Secrets rotation.** Changing `AUTH_SECRET` signs everyone out. Changing `CRON_SECRET` requires
  redeploying so Vercel Cron picks it up.
