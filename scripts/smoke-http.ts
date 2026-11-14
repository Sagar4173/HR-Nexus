/**
 * HTTP-level smoke test against a running production server.
 *
 * Usage (two terminals):
 *   npm run build && npm start -- -p 3100
 *   node --env-file=.env.local --import tsx scripts/smoke-http.ts
 *
 * Set BASE_URL to override http://localhost:3100.
 */
import { randomUUID } from "node:crypto";

import type { Role } from "../src/generated/prisma/enums";
import { prisma } from "../src/lib/db";
import { createSessionToken } from "../src/lib/auth";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";

const sessions = new Map<Role, string>();

async function cookieFor(role: Role): Promise<string> {
  const cached = sessions.get(role);
  if (cached) return cached;
  const employee = await prisma.employee.findFirst({
    where: { role, status: "ACTIVE" },
    orderBy: { employeeNo: "asc" },
  });
  if (!employee) throw new Error(`No active employee for ${role}`);
  const { token } = createSessionToken({
    employeeId: employee.id,
    employeeNo: employee.employeeNo,
    name: `${employee.firstName} ${employee.lastName}`,
    role,
  });
  const cookie = `hrnexus_session=${token}`;
  sessions.set(role, cookie);
  return cookie;
}

const results: Array<{ check: string; ok: boolean; detail: string }> = [];

function record(check: string, ok: boolean, detail: string): void {
  results.push({ check, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${check} — ${detail}`);
}

async function request(
  path: string,
  options: { role?: Role; method?: string; body?: unknown } = {},
): Promise<{ status: number; text: string; json: unknown }> {
  const headers: Record<string, string> = {};
  if (options.role) headers.cookie = await cookieFor(options.role);
  if (options.body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${BASE}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    redirect: "manual",
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // HTML responses are expected for pages.
  }
  return { status: response.status, text, json };
}

async function main(): Promise<void> {
  const health = await request("/api/health");
  const healthBody = health.json as { status?: string } | null;
  record(
    "health endpoint",
    health.status === 200 && healthBody?.status === "ok",
    `status ${health.status}`,
  );

  const anonymous = await request("/");
  record(
    "anonymous dashboard redirects to login",
    anonymous.status === 307,
    `${anonymous.status}`,
  );

  const markers: Array<[string, string]> = [
    ["/", "Operations overview"],
    ["/tickets", "Search ticket number"],
    ["/ask", "Ask a policy question"],
    ["/policies", "Policy library"],
    ["/sla", "SLA monitor"],
    ["/audit", "Audit trail"],
  ];
  for (const [path, marker] of markers) {
    const page = await request(path, { role: "HR_ADMIN" });
    record(
      `HR admin page ${path}`,
      page.status === 200 && page.text.includes(marker),
      `${page.status}${page.text.includes(marker) ? "" : ", marker missing"}`,
    );
  }

  const sensitive = await prisma.ticket.findFirst({
    where: { isSensitive: true },
    orderBy: { createdAt: "asc" },
  });
  if (!sensitive) throw new Error("No sensitive seeded ticket found");
  const path = `/tickets/${sensitive.id}`;
  const hrAgent = await request(path, { role: "HR_AGENT" });
  record("HR agent cannot open a restricted ticket", hrAgent.status === 404, `${hrAgent.status}`);
  const erSpecialist = await request(path, { role: "ER_SPECIALIST" });
  record(
    "ER specialist can open a restricted ticket",
    erSpecialist.status === 200 && erSpecialist.text.includes(sensitive.ticketNo),
    `${erSpecialist.status}`,
  );
  const apiAgent = await request(`/api/tickets/${sensitive.id}`, { role: "HR_AGENT" });
  record("restricted ticket API hidden from HR agent", apiAgent.status === 404, `${apiAgent.status}`);
  const apiEr = await request(`/api/tickets/${sensitive.id}`, { role: "ER_SPECIALIST" });
  record("restricted ticket API visible to ER", apiEr.status === 200, `${apiEr.status}`);

  const restrictedStandard = await prisma.ticket.findFirst({
    where: {
      isSensitive: false,
      queue: { isRestricted: true },
      status: { not: "CLOSED" },
    },
    orderBy: { createdAt: "asc" },
  });
  if (!restrictedStandard) throw new Error("No non-sensitive restricted-queue ticket found");
  const restrictedPath = `/tickets/${restrictedStandard.id}`;
  const restrictedPageAgent = await request(restrictedPath, { role: "HR_AGENT" });
  record(
    "HR agent cannot open a non-sensitive restricted-queue ticket",
    restrictedPageAgent.status === 404,
    `${restrictedPageAgent.status}`,
  );
  const restrictedApiAgent = await request(`/api/tickets/${restrictedStandard.id}`, {
    role: "HR_AGENT",
  });
  record(
    "restricted-queue ticket API hidden from HR agent",
    restrictedApiAgent.status === 404,
    `${restrictedApiAgent.status}`,
  );
  const restrictedActionAgent = await request(`/api/tickets/${restrictedStandard.id}`, {
    method: "PATCH",
    role: "HR_AGENT",
    body: { type: "priority", priority: "P2" },
  });
  record(
    "HR agent cannot mutate a restricted-queue ticket",
    restrictedActionAgent.status === 404,
    `${restrictedActionAgent.status}`,
  );
  const restrictedPageEr = await request(restrictedPath, { role: "ER_SPECIALIST" });
  record(
    "ER specialist can open a non-sensitive restricted-queue ticket",
    restrictedPageEr.status === 200 && restrictedPageEr.text.includes(restrictedStandard.ticketNo),
    `${restrictedPageEr.status}`,
  );

  const unauthAsk = await request("/api/ask", {
    method: "POST",
    body: { question: "How many annual leave days do I get?" },
  });
  record("ask API requires a session", unauthAsk.status === 401, `${unauthAsk.status}`);

  const answeredAsk = await request("/api/ask", {
    method: "POST",
    role: "EMPLOYEE",
    body: { question: "How many annual leave days do I get, and can I carry unused days over?" },
  });
  const answered = answeredAsk.json as {
    ticketId?: string;
    queue?: { slug: string };
    citations?: Array<{ validated: boolean }>;
    sensitive?: boolean;
  } | null;
  record(
    "ask API answers with validated citations",
    answeredAsk.status === 201 &&
      answered?.queue?.slug === "general-hr" &&
      (answered?.citations?.length ?? 0) > 0 &&
      answered?.citations?.every((citation) => citation.validated) === true,
    `${answeredAsk.status}, queue ${answered?.queue?.slug}, citations ${answered?.citations?.length}`,
  );

  if (answered?.ticketId) {
    const hrSender = await prisma.employee.findFirst({
      where: { role: "HR_AGENT", status: "ACTIVE" },
      orderBy: { employeeNo: "asc" },
    });
    if (!hrSender) throw new Error("No active HR agent found");
    await prisma.message.createMany({
      data: [
        {
          id: randomUUID(),
          ticketId: answered.ticketId,
          senderType: "HR_AGENT",
          senderEmployeeId: hrSender.id,
          body: "SMOKE-HR-ONLY-MARKER",
          visibility: "HR_ONLY",
          createdAt: new Date(),
        },
        {
          id: randomUUID(),
          ticketId: answered.ticketId,
          senderType: "SYSTEM",
          senderEmployeeId: null,
          body: "SMOKE-ER-ONLY-MARKER",
          visibility: "ER_ONLY",
          createdAt: new Date(),
        },
      ],
    });
  }

  const sensitiveAsk = await request("/api/ask", {
    method: "POST",
    role: "EMPLOYEE",
    body: {
      question: "I need to report harassment and retaliation by my manager. Please keep this confidential.",
    },
  });
  const routed = sensitiveAsk.json as {
    queue?: { slug: string };
    citations?: unknown[];
    priority?: string;
  } | null;
  record(
    "sensitive ask routes to ER without citations",
    sensitiveAsk.status === 201 &&
      routed?.queue?.slug === "er-restricted" &&
      routed?.priority === "P1" &&
      (routed?.citations?.length ?? -1) === 0,
    `${sensitiveAsk.status}, queue ${routed?.queue?.slug}, priority ${routed?.priority}, citations ${routed?.citations?.length}`,
  );

  if (answered?.ticketId) {
    const assignee = await prisma.employee.findFirst({
      where: { role: "HR_AGENT", status: "ACTIVE" },
      orderBy: { employeeNo: "asc" },
    });
    if (!assignee) throw new Error("No active HR agent found for assignment");

    type SlaBody = {
      ticket?: {
        sla?: {
          state?: string;
          pausedAt?: string | null;
          accumulatedPauseSec?: number;
        };
      };
    } | null;
    const slaOf = (body: unknown) => (body as SlaBody)?.ticket?.sla;
    const patch = (body: unknown) =>
      request(`/api/tickets/${answered.ticketId}`, {
        method: "PATCH",
        role: "HR_ADMIN",
        body,
      });
    const detailFor = (role: Role) =>
      request(`/api/tickets/${answered.ticketId}`, { role });

    const paused = await patch({ type: "wait_employee" });
    const pausedSla = slaOf((await detailFor("HR_ADMIN")).json);
    record(
      "ticket API pauses SLA while waiting",
      paused.status === 200 && pausedSla?.state === "PAUSED",
      `${paused.status}, state ${pausedSla?.state}`,
    );

    const started = await patch({ type: "start" });
    const startedSla = slaOf((await detailFor("HR_ADMIN")).json);
    record(
      "start resumes a paused SLA",
      started.status === 200 && startedSla?.state !== "PAUSED",
      `${started.status}, state ${startedSla?.state}`,
    );

    await patch({ type: "wait_employee" });
    const waitHr = await patch({ type: "wait_hr" });
    const waitHrSla = slaOf((await detailFor("HR_ADMIN")).json);
    record(
      "wait_hr resumes a paused SLA",
      waitHr.status === 200 && waitHrSla?.state !== "PAUSED",
      `${waitHr.status}, state ${waitHrSla?.state}`,
    );

    await patch({ type: "wait_employee" });
    const assigned = await patch({ type: "assign", assigneeId: assignee.id });
    const assignedSla = slaOf((await detailFor("HR_ADMIN")).json);
    record(
      "assign resumes a paused SLA",
      assigned.status === 200 && assignedSla?.state !== "PAUSED",
      `${assigned.status}, state ${assignedSla?.state}`,
    );

    await patch({ type: "wait_employee" });
    const escalated = await patch({ type: "escalate", reason: "Smoke-test escalation" });
    const escalatedSla = slaOf((await detailFor("HR_ADMIN")).json);
    record(
      "escalate resumes a paused SLA",
      escalated.status === 200 && escalatedSla?.state !== "PAUSED",
      `${escalated.status}, state ${escalatedSla?.state}`,
    );

    await patch({ type: "wait_employee" });
    const resolved = await patch({ type: "resolve", summary: "Smoke-test resolution" });
    const resolvedSla = slaOf((await detailFor("HR_ADMIN")).json);
    record(
      "resolve from paused clears the pause and records MET/BREACHED",
      resolved.status === 200 &&
        resolvedSla?.pausedAt === null &&
        ["MET", "BREACHED"].includes(resolvedSla?.state ?? "") &&
        (resolvedSla?.accumulatedPauseSec ?? 0) > 0,
      `${resolved.status}, state ${resolvedSla?.state}, pausedAt ${resolvedSla?.pausedAt}, pause ${resolvedSla?.accumulatedPauseSec}s`,
    );

    const forbidden = await request(`/api/tickets/${answered.ticketId}`, {
      method: "PATCH",
      role: "EMPLOYEE",
      body: { type: "close" },
    });
    record("employee cannot mutate tickets via API", forbidden.status === 403, `${forbidden.status}`);
    type DetailBody = { ticket?: { messages?: Array<{ body: string }> } } | null;
    const messagesOf = (body: unknown): string[] =>
      ((body as DetailBody)?.ticket?.messages ?? []).map((message) => message.body);
    const detail = await request(`/api/tickets/${answered.ticketId}`, { role: "EMPLOYEE" });
    record("employee can read their own ticket API", detail.status === 200, `${detail.status}`);
    const employeeMessages = messagesOf(detail.json);
    record(
      "employee API hides HR-only and ER-only messages",
      !employeeMessages.some(
        (body) => body.includes("SMOKE-HR-ONLY") || body.includes("SMOKE-ER-ONLY"),
      ),
      `${employeeMessages.length} visible messages`,
    );
    const hrDetail = await request(`/api/tickets/${answered.ticketId}`, { role: "HR_AGENT" });
    const hrMessages = messagesOf(hrDetail.json);
    record(
      "HR agent API sees HR-only but not ER-only messages",
      hrMessages.some((body) => body.includes("SMOKE-HR-ONLY")) &&
        !hrMessages.some((body) => body.includes("SMOKE-ER-ONLY")),
      `${hrMessages.length} visible messages`,
    );
    const adminDetail = await request(`/api/tickets/${answered.ticketId}`, { role: "HR_ADMIN" });
    const adminMessages = messagesOf(adminDetail.json);
    record(
      "HR admin API sees both hidden message visibilities",
      adminMessages.some((body) => body.includes("SMOKE-HR-ONLY")) &&
        adminMessages.some((body) => body.includes("SMOKE-ER-ONLY")),
      `${adminMessages.length} visible messages`,
    );
  }

  const failures = results.filter((result) => !result.ok);
  console.log(
    JSON.stringify(
      { checks: results.length, passed: results.length - failures.length, failed: failures.length },
      null,
      2,
    ),
  );
  if (failures.length > 0) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
