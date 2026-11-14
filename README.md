# HR Nexus

Policy-aware HR operations portal built with Next.js 16, React 19, TypeScript, Prisma 7 and PostgreSQL.

HR Nexus routes employee questions to the relevant policy workflow, validates citations against stored policy text, restricts sensitive Employee Relations cases, and tracks ticket SLAs and audit events.

## Features

- Role-scoped employee, HR agent, ER specialist, administrator and auditor views.
- Dated policy versions with audience rules and PostgreSQL full-text retrieval.
- Citation validation against the source version, quote and employee audience.
- Restricted routing for sensitive requests.
- Ticket lifecycle actions with SLA updates and audit records.
- HMAC-signed, HttpOnly demo sessions with current employee-role validation.

## Requirements

- Node.js 22 or newer.
- PostgreSQL database. Neon is supported.

Copy `.env.example` to `.env.local`, then configure `DATABASE_URL`, `DIRECT_URL` and `SESSION_SECRET`. Never commit `.env.local`.

```bash
npm install
npm run db:generate
npm run db:migrate
npm run dev
```

A provisioned database is required for login and populated portal views. Demo data is not bundled in this public source snapshot.

For full setup, running against a provisioned database, and candidate workspace dataset generation tools, see [Full Setup Guide](docs/setup.md).

## Validation

```bash
npm test          # 56 unit and regression tests across 9 test files
npx tsc --noEmit  # TypeScript type check
npm run lint      # ESLint
npm run build     # Next.js production build
npm run smoke     # Service-layer smoke test
```

## Project structure

```text
prisma/
  schema.prisma       PostgreSQL data model
  migrations/         Database migrations and constraints
src/
  app/                Portal pages, server actions and API routes
  components/         Shared presentation components
  lib/                Authentication, access, policy, ticket and SLA services
scripts/              Development and HTTP smoke utilities
tests/                Focused unit and regression tests
docs/architecture.md  Request flow, security boundaries and system design
```

## Technical notes

- Answers are extractive and use stored policy passages; the application does not require an external LLM API key.
- SLA schedules are demo configuration values and should be reviewed before production use.
- Seeded demo identities are intended for local demonstration. Replace the demo login flow with an organization identity provider before production use.

## License

Demo software; not intended for production use without a security and operational review.
