# Architecture

## System context

```
┌──────────────────────────┐        ┌───────────────────────────────┐
│ Browser                  │        │ Next.js 16 (App Router)       │
│  • portal pages          │ HTTPS  │  • Server Components          │
│  • forms / server actions│───────►│  • Route handlers (/api/*)    │
└──────────────────────────┘        │  • HMAC session cookies       │
                                    └──────────────┬────────────────┘
                                                   │ Prisma 7 + pg adapter
                                                   ▼
                                    ┌───────────────────────────────┐
                                    │ Neon PostgreSQL               │
                                    │  • 21 application tables      │
                                    │  • GIN full-text index        │
                                    │  • exclusion constraints      │
                                    │  • append-only audit trigger  │
                                    └───────────────────────────────┘
```

There is **no cache, queue, search cluster, vector database or worker**. Every authenticated page reads live PostgreSQL data per request. Deterministic business logic runs in-process.

## Rendering and authentication

- Portal routes are protected by `requireSession()` in the shared portal layout; SLA and audit pages additionally call `requireHrSession()`.
- Sessions use the HttpOnly `hrnexus_session` cookie: base64url JSON payload + HMAC-SHA256 signature, 12-hour expiry, verified with `timingSafeEqual`. Each authenticated session read also checks that the employee remains active and refreshes the role and display identity from PostgreSQL.
- Authorization is enforced at entry points and data boundaries: ticket reads scope requester and message visibility in `src/lib/queries.ts`; ticket mutations enforce allowed HR roles, restricted-ticket visibility, assignment rules and lifecycle transitions in `src/lib/tickets.ts`. The health endpoint is intentionally unauthenticated and returns only minimal status.
- Navigation visibility is not an authorization control; route handlers and services enforce their own relevant permissions.
- Restricted tickets return `404` — not `403` — to unauthorised roles so the API does not disclose their existence.
- `postinstall` runs `prisma generate`; generated client code is not committed.

## Ask pipeline

Implementation: `src/lib/classify.ts`, `src/lib/policy.ts`, `src/lib/tickets.ts`.

### 1. Classification

A keyword rule set maps the question to one of 12 categories:

`leave`, `remote-work`, `travel`, `expenses`, `code-of-conduct`, `harassment-posh`, `benefits`, `compensation`, `performance`, `separation`, `data-privacy`, `health-safety`.

- Matching is case-insensitive on normalised whitespace and uses word boundaries, so `leave` does not match `we leave the projector`.
- Sensitive keyword and phrase rules (harassment, discrimination, retaliation, POSH, stalking, unwanted advances, threats, blackmail, assault, self-harm) set `isSensitive`.
- Detection is a deterministic demo heuristic, not a trained classifier; ambiguous or unclassified disclosures are routed to human triage rather than answered automatically.
- Confidence is derived from the number of matched keyword groups; unknown topics are `null` and route to `general-hr` for human triage.

### 2. Sensitive routing

If `isSensitive`:

- No policy retrieval or automated answer runs.
- Queue = `er-restricted`, priority = `P1`, sensitivity = `ER_RESTRICTED`.
- A system message explains that a specialist will respond.
- An `SENSITIVE_ROUTED` audit event is written.
- HR agents cannot see the ticket; ER specialists, HR admins and auditors can.
- HR agents are also blocked from non-sensitive tickets stored in a restricted queue (`Queue.isRestricted`).

### 3. Policy version resolution

For the classified category and the requester context (`departmentCode`, `locationCountry`, `employmentType`, `grade`), `resolvePolicy` selects candidate versions where:

1. `status != DRAFT`;
2. `effectiveFrom <= asOf` and (`effectiveTo IS NULL` or `effectiveTo >= asOf`);
3. the document belongs to the category;
4. at least one audience rule matches the employee.

Candidates are ordered by **document code ascending, then effective date descending**, and the first row wins. This makes the outcome stable and testable even when several documents cover one category. The chosen document's effective version is the only version cited.

The question date defaults to "now"; callers may pass an explicit as-of date.

### 4. Retrieval

PostgreSQL full-text search ranks chunks **inside the resolved version only**:

```sql
SELECT ... ts_rank(to_tsvector('english', heading || ' ' || content),
                   websearch_to_tsquery('english', $question)) AS rank
FROM "PolicyChunk"
WHERE "policyVersionId" = $version
  AND to_tsvector(...) @@ websearch_to_tsquery('english', $question)
ORDER BY rank DESC, ordinal ASC
LIMIT 3
```

The `PolicyChunk_fts_idx` GIN index backs this query. If no chunk matches, the first three chunks are used as a deterministic fallback. If the version has no chunks, the answer is `insufficient`.

### 5. Extractive answer

- The primary citation is the `Entitlement` or `Rules` chunk when present; otherwise the top-ranked chunk.
- The supporting citation is the next-best distinct chunk.
- Quotes are capped at 340 characters (primary) and 260 characters (supporting) on a sentence or word boundary.
- The answer template names the document, version and effective date, quotes the sections verbatim, and states that it is not legal advice.
- No text is paraphrased or generated beyond fixed framing.

### 6. Citation validation

`validateCitation` rejects a citation unless:

1. the chunk exists and belongs to the cited version;
2. the quote is a verbatim substring of the chunk;
3. the version was effective on the answer date;
4. an audience rule applies to the employee.

The result (`VALID` / `INVALID` plus a note) is stored on `MessageCitation` and rendered in the ticket view. Invalid citations are never silently hidden.

### 7. Transactional ticket creation

`createAskTicket` writes in one `prisma.$transaction`:

1. ticket;
2. employee message;
3. AI run telemetry (`deterministic-extractive`);
4. assistant message (or sensitive system message);
5. citations;
6. SLA record and `STARTED` event;
7. initial lifecycle event and audit events.

The ticket number is `HR-<UTC year>-<sequence>` derived from the current ticket count; uniqueness is enforced by the database.

## SLA engine

Implementation: `src/lib/sla.ts`, `src/lib/sla-config.ts`. See [`sla-assumptions.md`](sla-assumptions.md).

- Deadlines are computed by adding **business minutes** to the start, pausing outside work hours.
- Calendar: `Asia/Kolkata`, Mon–Fri, 09:00–18:00 (540–1080 minutes), configured holidays excluded.
- The clock pauses on `WAITING_EMPLOYEE` and resumes on `WAITING_HR` or resolution; deadlines are extended by paused business minutes and wall-clock paused seconds accumulate on `TicketSla` for display.
- State evaluation:
  - resolved before the deadline → `MET`;
  - resolved after the deadline, or deadline passed while open → `BREACHED`;
  - currently paused → `PAUSED`;
  - past 75% of the resolution window → `AT_RISK`;
  - otherwise `ON_TRACK`.
- Pause intervals are converted to business minutes, so weekend and holiday wall-clock time does not inflate a deadline.
- Unit tests cover weekend rollover, holidays, after-hours starts, pause handling and the MET/BREACHED boundary.

## Ticket lifecycle

```
NEW ──► TRIAGED ──► ASSIGNED ──► IN_PROGRESS ──► RESOLVED ──► CLOSED
             │            │            │
             │            ├──► WAITING_EMPLOYEE ──► WAITING_HR
             │            ├──► WAITING_HR
             │            └──► ESCALATED
             └──► (priority / assignment updates)
```

Actions are exposed as server actions on the ticket page and as `PATCH /api/tickets/:id`:

`assign`, `start`, `wait_employee`, `wait_hr`, `resolve`, `escalate`, `priority`, `close`.

Each action:

1. checks the actor has an allowed ticket-action role (HR agent, ER specialist or HR admin); auditors and employees are rejected by the service;
2. checks restricted-ticket authority;
3. validates assignee eligibility (ER/HR admin only for restricted tickets);
4. updates the ticket/SLA in a transaction;
5. writes an `AuditEvent` with before/after state.

Priority changes recalculate SLA deadlines from the original start and reset the SLA state.

## Role-based access control

| Capability | Employee | HR Agent | ER Specialist | HR Admin | Auditor |
|---|---|---|---|---|---|
| Ask questions | ✅ | ✅ | ✅ | ✅ | ✅ |
| See own tickets | ✅ | ✅ | ✅ | ✅ | ✅ |
| See standard queues | ❌ | ✅ | ✅ | ✅ | ✅ |
| See restricted cases | ❌ | ❌ | ✅ | ✅ | ✅ |
| Act on tickets | ❌ | ✅ | ✅ | ✅ | ❌ |
| Assign restricted cases | ❌ | ❌ | ✅ | ✅ | ❌ |
| SLA monitor / audit | ❌ | ✅ | ✅ | ✅ | ✅ |

Employees are additionally scoped to `requesterId = session.employeeId` at the query level.

## HTTP surface

| Route | Method | Purpose |
|---|---|---|
| `/api/health` | GET | Unauthenticated minimal database reachability status |
| `/api/ask` | POST | Zod-validated question → ticket, answer, citations |
| `/api/tickets/:id` | GET | Role-scoped ticket detail |
| `/api/tickets/:id` | PATCH | Zod-validated lifecycle action |

Errors use standard status codes: `400` malformed JSON, `401` unauthenticated, `403` insufficient permission, `404` missing or hidden, `409` invalid state transition, `422` schema violation, `503` database down.

The health endpoint sets `cache-control: no-store` on both healthy and unhealthy responses. Ticket and ask API success responses also set `no-store`; error responses do not consistently set it, so the application does not currently guarantee that header on every response.

## Failure behaviour

- **No eligible policy** → `insufficient` answer, ticket still created and routed for human review.
- **No matching chunks** → deterministic fallback chunks; if the version is empty, `insufficient`.
- **Database unavailable** → `/api/health` returns `503`; pages surface the error boundary.
- **Invalid session** → redirect to `/login`.
- **Invalid API body** → `422` with Zod issue messages.
- **Invalid lifecycle transition** → `409`; no partial writes.

## Deliberate trade-offs

| Decision | Reason |
|---|---|
| Extractive answers only | Deterministic, verifiable, no API key; every sentence is traceable to a policy chunk |
| PostgreSQL FTS instead of embeddings | Corpus is 1,000 chunks; deterministic ranking is sufficient and cheaper to operate |
| Demo identity login | No credential handling in the demo; RBAC boundaries are exercised end to end |
| Business-hours calendar fixed to IST | Matches the intended operating context; configurable in `SlaCalendar` |
