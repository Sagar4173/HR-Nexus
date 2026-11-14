# Setup Guide

This guide reproduces the project from a clean clone using **Neon PostgreSQL** as the only database.

## 1. Prerequisites

| Tool | Version used | Notes |
|---|---|---|
| Node.js | 24.21 | 22+ supported |
| npm | 11+ | |
| Python | 3.14 | 3.12+ supported |
| Neon project | — | Free tier is sufficient |

No Docker, local PostgreSQL, Redis, Kafka or vector database is required or supported.

## 2. Install Node dependencies

```bash
npm install
```

`postinstall` runs `prisma generate`, producing the client in `src/generated/prisma` (gitignored).

## 3. Create the Neon database

1. Create a Neon project in a region close to you.
2. Copy **two** connection strings from the dashboard:
   - **Pooled** (hostname contains `-pooler`) → `DATABASE_URL`
   - **Direct** (no `-pooler`) → `DIRECT_URL`
3. Append `?sslmode=require` if Neon does not already include it.

The application uses the pooled URL through `@prisma/adapter-pg`. Migrations and COPY loading use the direct URL because they need a single session.

## 4. Configure environment variables

```bash
cp .env.example .env.local
```

`.env.local`:

```dotenv
DATABASE_URL="postgresql://USER:PASSWORD@HOST-pooler.REGION.aws.neon.tech/DBNAME?sslmode=require"
DIRECT_URL="postgresql://USER:PASSWORD@HOST.REGION.aws.neon.tech/DBNAME?sslmode=require"
SESSION_SECRET="<64 random hex characters>"
```

Generate a session secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

- Never commit `.env.local`.
- `SESSION_SECRET` must be at least 16 characters; shorter values fail fast at runtime.
- Optional `BASE_URL` overrides the HTTP smoke test target (default `http://localhost:3100`).

## 5. Apply migrations

```bash
npm run db:migrate
```

This runs `prisma migrate deploy` with `DIRECT_URL` from `prisma.config.ts`. It creates:

- 21 application tables and all enums;
- `PolicyVersion_no_overlap` exclusion constraint and `PolicyVersion_effective_range` check;
- `PolicyChunk_fts_idx` GIN full-text index;
- `Assignment_one_active_per_ticket` partial unique index;
- `AuditEvent_append_only` trigger.

Verify:

```bash
npm run db:check
```

Expected output lists 21 tables plus the constraints and indexes above.

## 6. Generate the synthetic dataset

```bash
cd data-pipeline
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
# source .venv/bin/activate
pip install -r requirements.txt
python generate.py
python validate.py
```

Outputs:

| Path | Contents |
|---|---|
| `data-pipeline/output/*.csv` | 21 tables in dependency order (gitignored) |
| `data/labels/*.jsonl` | 4 × 40 ground-truth anomaly records |
| `data/golden/questions.jsonl` | 60 evaluation cases |
| `data/reports/manifest.json` | SHA-256 + byte size for all 27 files |
| `data/reports/generation-report.md` | Volume and distribution summary |
| `data/reports/data-validation.md` | 64-check validation report |

Generation is deterministic: seed `20261114`, Faker `40.54.0`. Two consecutive runs must produce byte-identical files (verify with `Get-FileHash` on Windows or `shasum -a 256` on macOS/Linux).

## 7. Load the database

> [!WARNING]
> `npm run db:reset` will truncate existing application tables and overwrite database data with the pristine seed. Only run this when restoring the baseline dataset.

```bash
npm run db:reset    # truncate + COPY load
# or, into an empty database:
npm run db:load
```

The loader:

1. reads `data/reports/manifest.json`;
2. recomputes SHA-256 for every referenced file and aborts on mismatch;
3. opens a single direct connection;
4. truncates in reverse dependency order when `--reset` is passed;
5. streams each CSV with `COPY ... FROM STDIN`;
6. verifies core counts (`150` documents, `300` employees, `5,000` tickets, `20,000` messages, `5,000` SLA rows) and spot invariants.

A successful run prints a per-table row count summary.

## 8. Run the application

```bash
npm run dev
```

Open `http://localhost:3000`. You will be redirected to `/login`.

### Demo sign-in

Choose any seeded identity on the login page, or enter an employee number / email. Example accounts are selected by role:

| Role | How to sign in |
|---|---|
| Employee | First `EMPLOYEE` row, or any `EMP-xxxx` |
| HR Agent | First `HR_AGENT` row |
| ER Specialist | First `ER_SPECIALIST` row |
| HR Admin | First `HR_ADMIN` row |
| Auditor | First `AUDITOR` row |

Accounts are seeded; no password is required. Sessions expire after 12 hours.

## 9. Verify

```bash
npm test                    # 23 unit tests
npm run eval:golden         # 60/60 golden cases, writes data/reports/golden-evaluation.md
npm run smoke               # service-layer smoke test (mutates demo data)
npx tsc --noEmit            # type check
npm run build               # production build
```

HTTP-level verification:

```bash
npm run build
npm start -- -p 3100
# in a second terminal:
node --env-file=.env.local --import tsx scripts/smoke-http.ts
```

The HTTP smoke test creates a small number of tickets. Run `npm run db:reset` afterwards to restore the pristine 5,000-ticket dataset.

## 10. Regenerate from scratch

```bash
npm run db:reset
python data-pipeline/validate.py
npm run eval:golden
npm test
npm run build
```

## Troubleshooting

### `P1001: Can't reach database server`

- Confirm the Neon project is active (free tier suspends idle computes briefly).
- Use the pooled URL for `DATABASE_URL` and the direct URL for `DIRECT_URL`.
- Ensure `sslmode=require` is present.

### `prisma generate` errors after a schema change

```bash
npx prisma generate
```

The generated client is intentionally not committed.

### Loader rejects a file checksum

The CSVs and manifest are out of sync. Regenerate both:

```bash
cd data-pipeline && python generate.py
```

### `AuditEvent` rows cannot be deleted

That is the append-only trigger working as designed. Use `npm run db:reset`, which truncates tables rather than deleting rows.

### HTTP smoke test cannot authenticate

The test mints its own signed cookie using `SESSION_SECRET` from `.env.local`. Make sure the server was started with the same environment and `BASE_URL` matches its port.

### `pg` SSL warning in server logs

Node's `pg` warns that `sslmode=require` will adopt stricter semantics in a future major version. Neon requires TLS and the connection is encrypted; the warning is informational. No action is required for the demo.

### PowerShell `Invoke-WebRequest` drops the session cookie

Use `scripts/smoke-http.ts` (Node `fetch`) or a browser. The HMAC cookie contains characters that PowerShell's basic parser mishandles.

## Environment variables reference

| Variable | Required | Used by |
|---|---|---|
| `DATABASE_URL` | Yes | Application runtime (pooled) |
| `DIRECT_URL` | Yes | Prisma CLI, migrations, COPY loader |
| `SESSION_SECRET` | Yes | Session signing and HTTP smoke test |
| `BASE_URL` | No | `scripts/smoke-http.ts` only |
