# Verification Report

Final verification of the HR Nexus hackathon submission. All commands were run from the
repository root on **14 November 2026** against the Neon PostgreSQL project configured in
`.env.local`. No credentials are reproduced in this report.

## Environment

| Component | Version / state |
|---|---|
| Node.js | 24.21.0 |
| npm | 11.19.0 |
| Next.js | 16.4.6 |
| React | 19.3.0 |
| Prisma CLI / Client | 7.10.1 |
| TypeScript | 5.9.3 |
| Python | 3.14.7 (project virtual environment) |
| Database | Neon PostgreSQL, pooled runtime URL + direct migration/loader URL |
| Dataset seed | `20261114` |
| Git revision | `e4808f7` on `main` (feature work in the working tree) |

## Summary

| Gate | Result |
|---|---|
| Unit tests | **56 / 56 passed** (9 test files) |
| Type check | **passed**, no diagnostics |
| Lint | **passed**, 0 errors and 0 warnings |
| Production build | **passed**, 13 application routes compiled |
| Dataset validation | **64 / 64 checks passed** |
| Golden evaluation | **60 / 60 cases passed**, 60 validated citations |
| Service-layer smoke test | **passed** |
| HTTP / API / RBAC smoke test | **30 / 30 checks passed** |
| Database reset + manifest verification | **passed**, pristine seed restored |
| Schema inspection | 21 application tables + `_prisma_migrations`; constraints, indexes and audit trigger present |

## Commands and evidence

### 1. Unit tests

```bash
npm test
```

```
Test Files  9 passed (9)
Tests       56 passed (56)
```

Coverage across nine test files:

- `tests/classify.test.ts` (10 tests) — classification and sensitive-term detection
- `tests/sla.test.ts` (18 tests) — business-hours arithmetic, pause handling, pause-deadline extension and SLA state boundaries
- `tests/access.test.ts` (12 tests) — RBAC access control, ticket visibility and message filtering
- `tests/ticket-number.test.ts` (4 tests) — ticket number format parsing and generation
- `tests/policy-dates.test.ts` (4 tests) — policy effective date and version resolution logic
- `tests/format.test.ts` (2 tests) — formatting utilities
- `tests/session-freshness.test.ts` (2 tests) — session role freshness and inactive employee rejection
- `tests/health-route.test.ts` (2 tests) — minimal health endpoint status and raw error masking
- `tests/ticket-service-auth.test.ts` (2 tests) — service-level ticket action authorization for non-HR and auditor roles

### 2. Type checking

```bash
npx tsc --noEmit
```

Exited `0` with no output.

### 3. Linting

```bash
npm run lint
```

Exited `0` with no warnings and no errors. Two unused imports found by the first pass were
removed during final verification.

### 4. Production build

```bash
npm run build
```

Next.js 16.4.6 / Turbopack compiled successfully. The build generated:

```
ƒ /                    ƒ /api/ask              ƒ /api/health
ƒ /api/tickets/[id]    ƒ /ask                 ƒ /audit
ƒ /login               ƒ /policies            ƒ /policies/[id]
ƒ /sla                 ƒ /tickets             ƒ /tickets/[id]
○ /_not-found
```

All application routes are dynamic, as intended for authenticated, live database reads.

### 5. Dataset validation

```bash
data-pipeline\.venv\Scripts\python.exe data-pipeline\validate.py
```

```
{"checks": 64, "passed": 64, "failed": 0, "failures": [], "report": "data/reports/data-validation.md"}
```

This validates volume requirements, foreign keys, lifecycle distribution, message-per-ticket
invariants, verbatim citation quotes, policy-version non-overlap, all four labelled anomaly
cohorts, the 60-case golden set and the SHA-256 manifest. Report:
[`data/reports/data-validation.md`](../data/reports/data-validation.md).

### 6. Golden-set evaluation

```bash
npm run eval:golden
```

```
{
  "cases": 60,
  "passed": 60,
  "failed": 0,
  "citationsValid": 60,
  "failures": []
}
```

The evaluation ran after the final database reset. It resolves the expected version for
12 categories at 5 as-of dates, checks required and forbidden facts, extracts an answer and
re-validates the primary citation end to end. Report:
[`data/reports/golden-evaluation.md`](../data/reports/golden-evaluation.md).

### 7. Service-layer smoke test

```bash
npm run smoke
```

The test exercised the dashboard, ticket list/detail, policy list, SLA overview and audit
queries, then created two live tickets through `createAskTicket`:

- standard leave question → `general-hr`, `TRIAGED`, 2 citations, both `VALID`;
- harassment disclosure → `er-restricted`, `P1`, `ER_RESTRICTED`, 0 citations.

The test only creates demo tickets; it performs no destructive updates. The database was
reset afterwards.

### 8. HTTP / API / RBAC smoke test

The production build was served on port 3100 with `npm start -- -p 3100`, then:

```bash
node --env-file=.env.local --import tsx scripts/smoke-http.ts
```

```
{"checks": 30, "passed": 30, "failed": 0}
```

Verified checks:

- `/api/health` returns `200` with `status: "ok"`;
- anonymous `/` redirects to `/login` with `307`;
- HR Admin can open `/`, `/tickets`, `/ask`, `/policies`, `/sla` and `/audit` (`200`);
- HR Agent receives `404` for a sensitive restricted ticket page and API;
- ER Specialist receives `200` for the same sensitive ticket page and API;
- HR Agent receives `404` for a non-sensitive restricted-queue ticket page, API read and API mutate;
- ER Specialist receives `200` for the same non-sensitive restricted-queue ticket;
- unauthenticated `POST /api/ask` returns `401`;
- standard ask returns `201`, routes to `general-hr` and returns validated citations;
- sensitive ask returns `201`, routes to `er-restricted` at `P1` with no citations;
- HR Admin can pause SLA (wait\_employee), resume via start, wait\_hr, assign and escalate;
- resolve from paused state clears pause and records `MET` or `BREACHED`;
- an employee receives `403` when mutating a ticket;
- an employee can read their own ticket API;
- employee API hides `HR_ONLY` and `ER_ONLY` messages;
- HR Agent API sees `HR_ONLY` but not `ER_ONLY` messages;
- HR Admin API sees both hidden message visibilities.

The HTTP smoke test creates two tickets and mutates one of them through multiple SLA
lifecycle transitions. It also inserts `HR_ONLY` and `ER_ONLY` probe messages to verify
message visibility filtering per role. The database was reset afterwards, so these writes
are not present in the submitted state.

### 9. Database reset and schema inspection

```bash
npm run db:reset
npm run db:check
```

`db:reset` verified all **27** manifest files, truncated the seed tables and COPY-loaded the
pristine dataset. Core counts and invariants passed:

| Table | Rows |
|---|---:|
| `PolicyDocument` | 150 |
| `PolicyVersion` | 200 |
| `PolicyChunk` | 1,000 |
| `Employee` | 300 |
| `Ticket` | 5,000 |
| `Message` | 20,000 |
| `MessageCitation` | 4,568 (4,528 valid; 40 flagged obsolete-version cases) |
| `AuditEvent` | 14,733 |

The loader's own invariant checks also passed: 4 messages per ticket, verbatim citation
quotes, one active assignment per ticket, every ticket has an SLA, and every policy document
has at least one version.

`db:check` confirmed:

- 21 application tables plus `_prisma_migrations`;
- constraints `PolicyVersion_effective_range` (check) and `PolicyVersion_no_overlap`
  (exclusion);
- indexes `Assignment_one_active_per_ticket` (partial unique) and `PolicyChunk_fts_idx` (GIN);
- the `AuditEvent_append_only` trigger, enabled (`tgenabled = 'O'`).

A transaction-level update probe against one `AuditEvent` row was rejected with
`AuditEvent is append-only`, then rolled back. The row count remained 14,733, confirming the
trigger enforces immutability at the database boundary.

## Final database state

After the final `npm run db:reset`:

```
documents 150 · versions 200 · chunks 1000 · employees 300
tickets 5000 · messages 20000 · citations 4568 · audit events 14733
```

The database is in the pristine, reproducible seed state. A subsequent read-only golden
evaluation did not change any rows.

## Screenshots

UI captures are present in the repository root: `login.png`, `dashboard.png`, `tickets.png`,
`ticket-detail.png`, `ask.png`, `policies.png`, `sla.png`, `audit.png`,
`mobile-dashboard.png` and `mobile-ask.png`. They were captured during the smoke-test session,
before the final database reset, so the dashboard capture shows the five smoke-created tickets
(`5,005`). Functional counts differ from the reset state by those five demo rows only.

## Known warnings and limitations

- **PostgreSQL SSL notice.** `pg` prints a future `sslmode=require` semantics warning. The
  Neon connection is TLS-encrypted; the notice is informational and does not affect this demo.
- **Synthetic data artefacts.** Some generated policy titles carry numeric suffixes and some
  seed timestamps extend past the dataset anchor. Both are cosmetic and documented in the
  README and dataset reports.
- **Demo authentication.** Sign-in uses seeded employee identities rather than passwords or
  SSO, as documented. RBAC is still enforced in pages, queries and APIs.
- **SLA snapshots.** Seeded SLA states are historical snapshots; live tickets evaluate state
  when actions occur. No background scheduler is used.
- **Screenshots predate the final reset** as noted above. Retake them after a reset if exact
  final-state counts are required for submission.

## Reproduction

From a clean checkout with `.env.local` configured, generate the dataset first (the CSVs are
gitignored; see `docs/setup.md` §6):

```bash
cd data-pipeline
python -m venv .venv
# Windows: .venv\Scripts\activate   ·   macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python generate.py
python validate.py
cd ..

npm install
npm run db:migrate
npm run db:reset
npm test
npx tsc --noEmit
npm run eval:golden
npm run build
npm start -- -p 3100
# second terminal:
node --env-file=.env.local --import tsx scripts/smoke-http.ts
npm run db:reset     # restore pristine state after smoke tests
```

The dataset itself can be regenerated and re-validated with:

```bash
cd data-pipeline
python generate.py
python validate.py
```
