import { NextResponse } from "next/server";
import { z } from "zod";

import { isUuid } from "@/lib/access";
import { HR_ROLES, getSession, isReadOnly } from "@/lib/auth";
import { getTicketDetail } from "@/lib/queries";
import { applyTicketAction, type TicketAction } from "@/lib/tickets";

export const dynamic = "force-dynamic";

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("assign"), assigneeId: z.uuid() }),
  z.object({ type: z.literal("start") }),
  z.object({ type: z.literal("wait_employee") }),
  z.object({ type: z.literal("wait_hr") }),
  z.object({ type: z.literal("resolve"), summary: z.string().trim().min(5).max(2000) }),
  z.object({ type: z.literal("escalate"), reason: z.string().trim().min(5).max(1000) }),
  z.object({ type: z.literal("close") }),
  z.object({ type: z.literal("priority"), priority: z.enum(["P1", "P2", "P3", "P4"]) }),
]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }
  const record = await getTicketDetail(id, session);
  if (!record) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }
  return NextResponse.json(
    {
      ticket: {
        id: record.ticket.id,
        ticketNo: record.ticket.ticketNo,
        subject: record.ticket.subject,
        status: record.ticket.status,
        priority: record.ticket.priority,
        sensitivity: record.ticket.sensitivity,
        isSensitive: record.ticket.isSensitive,
        queue: record.ticket.queue.name,
        category: record.ticket.category?.name ?? null,
        createdAt: record.ticket.createdAt,
        messages: record.ticket.messages.map((message) => ({
          id: message.id,
          senderType: message.senderType,
          visibility: message.visibility,
          body: message.body,
          createdAt: message.createdAt,
          citations: message.citations.map((citation) => ({
            documentCode: citation.policyVersion.policyDocument.code,
            versionLabel: citation.policyVersion.versionLabel,
            heading: citation.policyChunk.heading,
            quote: citation.quote,
            validated: citation.validated,
          })),
        })),
        sla: record.ticket.sla
          ? {
              state: record.ticket.sla.state,
              firstResponseDueAt: record.ticket.sla.firstResponseDueAt,
              resolutionDueAt: record.ticket.sla.resolutionDueAt,
              pausedAt: record.ticket.sla.pausedAt,
              accumulatedPauseSec: record.ticket.sla.accumulatedPauseSec,
              rule: record.ticket.sla.rule.code,
              calendar: record.ticket.sla.calendar.timezone,
            }
          : null,
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (!HR_ROLES.includes(session.role) || isReadOnly(session.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const parsed = actionSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid action", issues: parsed.error.issues.map((issue) => issue.message) },
      { status: 422 },
    );
  }

  try {
    const result = await applyTicketAction(id, {
      employeeId: session.employeeId,
      role: session.role,
      name: session.name,
    }, parsed.data as TicketAction);
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "Ticket not found") {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }
    if (isDomainActionError(message)) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    console.error("Ticket action failed", error);
    return NextResponse.json({ error: "Ticket update failed" }, { status: 500 });
  }
}

const DOMAIN_ACTION_ERRORS = [
  "Auditors have read-only access",
  "Assignee not found",
  "Tickets must be assigned to active staff",
  "Restricted tickets must be assigned to an ER specialist",
  "Standard tickets must be assigned to HR staff",
  "Resolved or closed tickets cannot be reassigned",
  "Closed tickets cannot change priority",
  "Resolution summary is required",
  "Escalation reason is required",
];

function isDomainActionError(message: string): boolean {
  return (
    DOMAIN_ACTION_ERRORS.includes(message) ||
    message.startsWith("Cannot ") ||
    message.startsWith("SLA configuration")
  );
}
