import { createHash, randomUUID } from "node:crypto";

import { formatInTimeZone } from "date-fns-tz";

import type { Priority, Role } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";

import { canAssignRole, canViewTicket, HR_ROLES, isTerminalTicketStatus, TICKET_ACTION_ROLES } from "./access";
import { classifyQuestion, sensitivityFor } from "./classify";
import { prisma } from "./db";
import { answerPolicyQuestion, type Citation, type EmployeeContext } from "./policy";
import { loadSlaConfiguration, loadSlaConfigurationForTicket, type SlaConfiguration } from "./sla-config";
import {
  addBusinessMinutes,
  evaluateSlaState,
  extendDeadlinesForPause,
  pausedBusinessMinutesFromEvents,
} from "./sla";
import { nextTicketNumber } from "./ticket-number";

export type Actor = { employeeId: string; role: Role; name: string };

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function contextFor(employee: {
  department: { code: string };
  locationCountry: string;
  employmentType: string;
  grade: string;
}): EmployeeContext {
  return {
    departmentCode: employee.department.code,
    locationCountry: employee.locationCountry,
    employmentType: employee.employmentType,
    grade: employee.grade,
  };
}

const PRIORITY_BY_CATEGORY: Record<string, Priority> = {
  compensation: "P2",
  benefits: "P2",
  travel: "P2",
  expenses: "P2",
};

function priorityFor(categorySlug: string | null, isSensitive: boolean): Priority {
  if (isSensitive) return "P1";
  if (categorySlug && PRIORITY_BY_CATEGORY[categorySlug]) return PRIORITY_BY_CATEGORY[categorySlug];
  return "P3";
}

function statusForAction(current: string, next: string): boolean {
  const allowed: Record<string, string[]> = {
    NEW: ["TRIAGED", "ASSIGNED"],
    TRIAGED: ["ASSIGNED", "IN_PROGRESS", "WAITING_EMPLOYEE", "ESCALATED"],
    ASSIGNED: ["IN_PROGRESS", "WAITING_EMPLOYEE", "WAITING_HR", "ESCALATED", "RESOLVED"],
    IN_PROGRESS: ["WAITING_EMPLOYEE", "WAITING_HR", "ESCALATED", "RESOLVED"],
    WAITING_EMPLOYEE: ["IN_PROGRESS", "ASSIGNED", "WAITING_HR", "ESCALATED", "RESOLVED"],
    WAITING_HR: ["IN_PROGRESS", "WAITING_EMPLOYEE", "ESCALATED", "RESOLVED"],
    ESCALATED: ["IN_PROGRESS", "WAITING_EMPLOYEE", "WAITING_HR", "RESOLVED"],
    RESOLVED: ["CLOSED"],
    CLOSED: [],
  };
  return (allowed[current] ?? []).includes(next);
}

async function writeAudit(
  tx: Prisma.TransactionClient,
  actor: Actor,
  action: string,
  entityId: string,
  before: unknown,
  after: unknown,
): Promise<void> {
  await tx.auditEvent.create({
    data: {
      id: randomUUID(),
      actorType: actor.role,
      actorId: actor.employeeId,
      action,
      entityType: "Ticket",
      entityId,
      beforeJson: before === undefined ? Prisma.JsonNull : (before as Prisma.InputJsonValue),
      afterJson: after === undefined ? Prisma.JsonNull : (after as Prisma.InputJsonValue),
      requestId: randomUUID(),
    },
  });
}

export type AskResult = {
  ticketId: string;
  ticketNo: string;
  status: string;
  priority: Priority;
  sensitivity: string;
  sensitive: boolean;
  queue: { slug: string; name: string };
  category: { slug: string; name: string } | null;
  classification: {
    categorySlug: string | null;
    confidence: number;
    isSensitive: boolean;
    matchedKeywords: string[];
  };
  answer: string | null;
  citations: Citation[];
  policyVersionId: string | null;
};

export async function createAskTicket(input: {
  requesterId: string;
  question: string;
}): Promise<AskResult> {
  const question = input.question.trim();
  if (question.length < 8) throw new Error("Please provide a little more detail (at least 8 characters).");
  if (question.length > 4000) throw new Error("Question is too long (maximum 4,000 characters).");

  const employee = await prisma.employee.findUnique({
    where: { id: input.requesterId },
    include: { department: true },
  });
  if (!employee) throw new Error("Requester not found");
  if (employee.status === "INACTIVE") throw new Error("Inactive employees cannot raise tickets");

  const classification = classifyQuestion(question);
  const sensitive = classification.isSensitive;
  const categorySlug = classification.categorySlug;

  const category = categorySlug
    ? await prisma.category.findUnique({
        where: { slug: categorySlug },
        include: { defaultQueue: true },
      })
    : null;
  const sensitivity = sensitivityFor(sensitive, category?.isSensitiveDefault);

  const queueSlug = sensitive ? "er-restricted" : category?.defaultQueue?.slug ?? "general-hr";
  const queue = await prisma.queue.findUnique({ where: { slug: queueSlug } });
  if (!queue) throw new Error("Queue is not configured");

  const priority = priorityFor(categorySlug, sensitive);
  const config = await loadSlaConfiguration(priority);
  const startedAt = new Date();
  const firstResponseDueAt = addBusinessMinutes(startedAt, config.rule.firstResponseMinutes, config.business);
  const resolutionDueAt = addBusinessMinutes(startedAt, config.rule.resolutionMinutes, config.business);

  const isAmbiguous = !sensitive && !category;
  const context = contextFor(employee);

  const policyAnswer =
    !sensitive && category
      ? await answerPolicyQuestion({
          categorySlug: category.slug,
          question,
          context,
          asOf: startedAt,
        })
      : null;

  const now = startedAt;
  const ticketId = randomUUID();
  const employeeMessageId = randomUUID();
  const agentMessageId = randomUUID();
  const aiRunId = randomUUID();
  const slaId = randomUUID();
  const conversationTime = new Date(now.getTime() + 1000);

  let answerText: string | null = null;
  let aiKind: "ANSWER" | "CLARIFY" | "CLASSIFY" = "ANSWER";
  let aiStatus: "SUCCESS" | "FALLBACK" | "FAILED" = "SUCCESS";
  let answerMode: "answered" | "insufficient" | "sensitive" | "clarify" = "answered";
  let citations: Citation[] = [];

  if (sensitive) {
    aiKind = "CLASSIFY";
    answerMode = "sensitive";
    answerText =
      "Your confidential request has been received. It has been routed to the restricted Employee Relations queue, where a specialist will review it. Please do not share additional sensitive details in this channel.";
  } else if (isAmbiguous) {
    aiKind = "CLARIFY";
    answerMode = "clarify";
    answerText =
      "I can help. Which policy area does your question relate to — leave, remote work, travel, expenses, benefits, compensation, performance, separation, privacy or safety?";
  } else if (policyAnswer) {
    answerText = policyAnswer.answer;
    citations = policyAnswer.citations;
    aiStatus = policyAnswer.mode === "answered" ? "SUCCESS" : "FALLBACK";
    answerMode = policyAnswer.mode;
  }

  const output = {
    classification: {
      category: categorySlug,
      confidence: classification.confidence,
      sensitive,
      matchedKeywords: classification.matchedKeywords,
    },
    routing: { queue: queueSlug, priority },
    answerMode,
    citations: citations.map((citation) => citation.chunkId),
  };

  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(918273)`;
    const year = formatInTimeZone(now, "Asia/Kolkata", "yyyy");
    const latest = await tx.ticket.findFirst({
      where: { ticketNo: { startsWith: `HR-${year}-` } },
      orderBy: { ticketNo: "desc" },
      select: { ticketNo: true },
    });
    const ticketNo = nextTicketNumber(latest?.ticketNo ?? null, year);

    await tx.ticket.create({
      data: {
        id: ticketId,
        ticketNo,
        requesterId: employee.id,
        queueId: queue.id,
        categoryId: category?.id ?? null,
        subject: question.slice(0, 140),
        description: question,
        status: isAmbiguous ? "WAITING_EMPLOYEE" : "TRIAGED",
        priority,
        sensitivity,
        isSensitive: sensitive,
        aiIntent: categorySlug,
        aiConfidence: classification.confidence,
        sourceChannel: "WEB",
        firstResponseAt: conversationTime,
      },
    });

    await tx.message.create({
      data: {
        id: employeeMessageId,
        ticketId,
        senderType: "EMPLOYEE",
        senderEmployeeId: employee.id,
        body: question,
        visibility: "REQUESTER_AND_HR",
        createdAt: now,
      },
    });

    await tx.aiRun.create({
      data: {
        id: aiRunId,
        ticketId,
        kind: aiKind,
        provider: "extractive",
        model: "policy-snippets-v1",
        promptVersion: "rag-answer-v1",
        inputHash: sha256(`${question}|${now.toISOString()}|${employee.id}`),
        outputJson: output,
        status: aiStatus,
        fallbackUsed: true,
        latencyMs: 0,
        tokensIn: null,
        tokensOut: null,
        errorMessage: null,
        createdAt: conversationTime,
      },
    });

    if (answerText) {
      await tx.message.create({
        data: {
          id: agentMessageId,
          ticketId,
          senderType: sensitive ? "SYSTEM" : "AI",
          senderEmployeeId: null,
          body: answerText,
          visibility: "REQUESTER_AND_HR",
          createdAt: conversationTime,
          aiRunId,
        },
      });
    }

    if (citations.length > 0) {
      await tx.messageCitation.createMany({
        data: citations.map((citation, index) => ({
          id: randomUUID(),
          messageId: agentMessageId,
          policyVersionId: citation.policyVersionId,
          policyChunkId: citation.chunkId,
          quote: citation.quote,
          rank: index + 1,
          validated: citation.validated ? "VALID" : "INVALID",
          validationNote: citation.validationNote,
          createdAt: conversationTime,
        })),
      });
    }

    await tx.ticketSla.create({
      data: {
        id: slaId,
        ticketId,
        ruleId: config.rule.id,
        calendarId: config.calendar.id,
        startedAt,
        firstResponseDueAt,
        resolutionDueAt,
        firstRespondedAt: conversationTime,
        state: isAmbiguous ? "PAUSED" : "ON_TRACK",
        pausedAt: isAmbiguous ? startedAt : null,
        accumulatedPauseSec: 0,
      },
    });

    await tx.slaEvent.create({
      data: {
        id: randomUUID(),
        ticketSlaId: slaId,
        type: "STARTED",
        occurredAt: startedAt,
        note: `${config.rule.code} attached at ticket creation.`,
      },
    });
    if (isAmbiguous) {
      await tx.slaEvent.create({
        data: {
          id: randomUUID(),
          ticketSlaId: slaId,
          type: "PAUSED",
          occurredAt: startedAt,
          note: "Paused while waiting for employee clarification.",
        },
      });
    }

    await writeAudit(
      tx,
      { employeeId: employee.id, role: employee.role, name: `${employee.firstName} ${employee.lastName}` },
      "TICKET_CREATED",
      ticketId,
      undefined,
      { ticketNo, queue: queueSlug, priority, sensitivity },
    );
    await writeAudit(tx, { employeeId: employee.id, role: employee.role, name: `${employee.firstName} ${employee.lastName}` }, sensitive ? "SENSITIVE_ROUTED" : "AI_ANSWERED", ticketId, undefined, {
      queue: queueSlug,
      category: categorySlug,
      answerMode,
      citationCount: citations.length,
    });

    return {
      ticketId,
      ticketNo,
      status: isAmbiguous ? "WAITING_EMPLOYEE" : "TRIAGED",
    };
  });

  return {
    ...result,
    priority,
    sensitivity,
    sensitive,
    queue: { slug: queue.slug, name: queue.name },
    category: category ? { slug: category.slug, name: category.name } : null,
    classification: {
      categorySlug,
      confidence: classification.confidence,
      isSensitive: sensitive,
      matchedKeywords: classification.matchedKeywords,
    },
    answer: answerText,
    citations,
    policyVersionId: citations[0]?.policyVersionId ?? null,
  };
}

async function ensureActorCanAct(
  actor: Actor,
  ticket?: { isSensitive: boolean; queue: { isRestricted: boolean } },
): Promise<void> {
  if (actor.role === "AUDITOR") throw new Error("Auditors have read-only access");
  if (!HR_ROLES.includes(actor.role) || !TICKET_ACTION_ROLES.includes(actor.role)) {
    throw new Error("Only HR staff can update tickets");
  }
  if (!ticket) return;
  if (!canViewTicket(actor.role, ticket)) throw new Error("Ticket not found");
}

export type TicketAction =
  | { type: "assign"; assigneeId: string }
  | { type: "start" }
  | { type: "wait_employee" }
  | { type: "wait_hr" }
  | { type: "resolve"; summary: string }
  | { type: "escalate"; reason: string }
  | { type: "close" }
  | { type: "priority"; priority: Priority };

export async function applyTicketAction(
  ticketId: string,
  actor: Actor,
  action: TicketAction,
): Promise<{ status: string }> {
  await ensureActorCanAct(actor);
  const before = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      sla: true,
      queue: { select: { isRestricted: true } },
    },
  });
  if (!before) throw new Error("Ticket not found");
  await ensureActorCanAct(actor, before);

  const now = new Date();
  let config: SlaConfiguration | null = null;
  if (before.sla) {
    config = await loadSlaConfigurationForTicketSafe(before.sla.ruleId, before.sla.calendarId);
  }

  return prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.findUnique({
      where: { id: ticketId },
      include: {
        sla: {
          include: {
            events: {
              orderBy: { occurredAt: "asc" },
              select: { type: true, occurredAt: true },
            },
          },
        },
      },
    });
    if (!ticket) throw new Error("Ticket not found");
    const currentTicket = ticket;

    async function resumePausedSla(at: Date, resolved: boolean) {
      const sla = currentTicket.sla;
      const pausedAt = sla?.pausedAt;
      if (!sla || !pausedAt) return null;
      if (!config) throw new Error("SLA configuration could not be loaded");
      const extension = extendDeadlinesForPause({
        pausedAt,
        resumedAt: at,
        firstResponseDueAt: sla.firstResponseDueAt,
        resolutionDueAt: sla.resolutionDueAt,
        calendar: config.business,
      });
      const accumulatedPauseSec = sla.accumulatedPauseSec + extension.pausedSeconds;
      const firstResponseDueAt = extension.firstResponseDueAt ?? sla.firstResponseDueAt;
      const state = evaluateSlaState(
        {
          startedAt: sla.startedAt,
          firstResponseDueAt,
          resolutionDueAt: extension.resolutionDueAt,
          firstRespondedAt: sla.firstRespondedAt,
          resolvedAt: resolved ? at : null,
          pausedAt: null,
          accumulatedPauseSec,
        },
        at,
        config.rule.resolutionMinutes,
        config.rule.escalationPct,
        config.business,
      );
      await tx.ticketSla.update({
        where: { id: sla.id },
        data: {
          pausedAt: null,
          accumulatedPauseSec,
          firstResponseDueAt,
          resolutionDueAt: extension.resolutionDueAt,
          state,
          ...(resolved ? { resolvedAt: at } : {}),
        },
      });
      await tx.slaEvent.create({
        data: {
          id: randomUUID(),
          ticketSlaId: sla.id,
          type: "RESUMED",
          occurredAt: at,
          note: `Resumed after ${extension.pausedBusinessMinutes} business minutes paused (${extension.pausedSeconds} seconds wall clock).`,
        },
      });
      return { state, ...extension };
    }

    const snapshot = {
      status: ticket.status,
      assigneeId: ticket.assigneeId,
      priority: ticket.priority,
      queueId: ticket.queueId,
    };
    let nextStatus = ticket.status;
    let auditAction = "TICKET_UPDATED";
    let auditAfter: Record<string, unknown> = {};

    switch (action.type) {
      case "assign": {
        if (isTerminalTicketStatus(ticket.status)) {
          throw new Error("Resolved or closed tickets cannot be reassigned");
        }
        const assignee = await tx.employee.findUnique({ where: { id: action.assigneeId } });
        if (!assignee) throw new Error("Assignee not found");
        if (assignee.status !== "ACTIVE") {
          throw new Error("Tickets must be assigned to active staff");
        }
        if (!canAssignRole(ticket.isSensitive, assignee.role)) {
          throw new Error(
            ticket.isSensitive
              ? "Restricted tickets must be assigned to an ER specialist"
              : "Standard tickets must be assigned to HR staff",
          );
        }
        const active = await tx.assignment.findFirst({
          where: { ticketId, unassignedAt: null },
        });
        if (active) {
          await tx.assignment.update({
            where: { id: active.id },
            data: { unassignedAt: now },
          });
        }
        await tx.assignment.create({
          data: {
            id: randomUUID(),
            ticketId,
            assigneeId: assignee.id,
            assignedById: actor.employeeId,
            queueId: ticket.queueId,
            assignedAt: now,
            reason: "Assigned from the ticket workspace",
          },
        });
        nextStatus = statusForAction(ticket.status, "ASSIGNED") ? "ASSIGNED" : ticket.status;
        await tx.ticket.update({ where: { id: ticketId }, data: { assigneeId: assignee.id, status: nextStatus } });
        await resumePausedSla(now, false);
        auditAction = "TICKET_ASSIGNED";
        auditAfter = { assigneeId: assignee.id, assignee: `${assignee.firstName} ${assignee.lastName}` };
        break;
      }
      case "start": {
        if (!statusForAction(ticket.status, "IN_PROGRESS")) throw new Error(`Cannot start a ${ticket.status} ticket`);
        nextStatus = "IN_PROGRESS";
        await tx.ticket.update({ where: { id: ticketId }, data: { status: nextStatus } });
        await resumePausedSla(now, false);
        auditAction = "TICKET_STATUS_CHANGED";
        auditAfter = { status: nextStatus };
        break;
      }
      case "wait_employee": {
        if (!statusForAction(ticket.status, "WAITING_EMPLOYEE")) throw new Error(`Cannot pause a ${ticket.status} ticket`);
        nextStatus = "WAITING_EMPLOYEE";
        await tx.ticket.update({ where: { id: ticketId }, data: { status: nextStatus } });
        if (ticket.sla && config) {
          await tx.ticketSla.update({
            where: { id: ticket.sla.id },
            data: { pausedAt: now, state: "PAUSED" },
          });
          await tx.slaEvent.create({
            data: {
              id: randomUUID(),
              ticketSlaId: ticket.sla.id,
              type: "PAUSED",
              occurredAt: now,
              note: "Paused while waiting for the employee.",
            },
          });
        }
        auditAction = "TICKET_STATUS_CHANGED";
        auditAfter = { status: nextStatus, sla: "PAUSED" };
        break;
      }
      case "wait_hr": {
        if (!statusForAction(ticket.status, "WAITING_HR")) throw new Error(`Cannot move a ${ticket.status} ticket to WAITING_HR`);
        nextStatus = "WAITING_HR";
        await tx.ticket.update({ where: { id: ticketId }, data: { status: nextStatus } });
        await resumePausedSla(now, false);
        auditAction = "TICKET_STATUS_CHANGED";
        auditAfter = { status: nextStatus };
        break;
      }
      case "resolve": {
        const summary = action.summary.trim();
        if (summary.length < 5) throw new Error("Resolution summary is required");
        if (!statusForAction(ticket.status, "RESOLVED")) throw new Error(`Cannot resolve a ${ticket.status} ticket`);
        nextStatus = "RESOLVED";
        await tx.ticket.update({
          where: { id: ticketId },
          data: { status: nextStatus, resolvedAt: now },
        });
        await tx.resolution.upsert({
          where: { ticketId },
          create: {
            id: randomUUID(),
            ticketId,
            resolvedById: actor.employeeId,
            summary,
            resolutionType: ticket.isSensitive ? "REFERRED" : "ANSWERED",
            createdAt: now,
          },
          update: { summary, resolvedById: actor.employeeId, createdAt: now },
        });
        if (ticket.sla) {
          // Resolving while paused also resumes the clock: paused business
          // time extends both deadlines before MET/BREACHED is decided.
          const resumed = await resumePausedSla(now, true);
          const slaState =
            resumed?.state ??
            (now.getTime() <= ticket.sla.resolutionDueAt.getTime() ? "MET" : "BREACHED");
          await tx.ticketSla.update({
            where: { id: ticket.sla.id },
            data: {
              resolvedAt: now,
              state: slaState,
              pausedAt: null,
            },
          });
          await tx.slaEvent.create({
            data: {
              id: randomUUID(),
              ticketSlaId: ticket.sla.id,
              type: slaState === "MET" ? "MET" : "BREACHED",
              occurredAt: now,
              note: `Resolution recorded; SLA ${slaState.toLowerCase()}.`,
            },
          });
        }
        auditAction = "TICKET_RESOLVED";
        auditAfter = { status: nextStatus, summary };
        break;
      }
      case "escalate": {
        const reason = action.reason.trim();
        if (reason.length < 5) throw new Error("Escalation reason is required");
        if (!statusForAction(ticket.status, "ESCALATED")) throw new Error(`Cannot escalate a ${ticket.status} ticket`);
        nextStatus = "ESCALATED";
        const existing = await tx.escalation.count({ where: { ticketId } });
        await tx.escalation.create({
          data: {
            id: randomUUID(),
            ticketId,
            level: existing > 0 ? "LEVEL_2" : "LEVEL_1",
            reason,
            escalatedToId: null,
            createdAt: now,
          },
        });
        await tx.ticket.update({ where: { id: ticketId }, data: { status: nextStatus } });
        await resumePausedSla(now, false);
        auditAction = "TICKET_ESCALATED";
        auditAfter = { status: nextStatus, reason, level: existing > 0 ? "LEVEL_2" : "LEVEL_1" };
        break;
      }
      case "close": {
        if (!statusForAction(ticket.status, "CLOSED")) throw new Error(`Cannot close a ${ticket.status} ticket`);
        nextStatus = "CLOSED";
        await tx.ticket.update({
          where: { id: ticketId },
          data: { status: nextStatus, closedAt: now },
        });
        auditAction = "TICKET_CLOSED";
        auditAfter = { status: nextStatus };
        break;
      }
      case "priority": {
        if (ticket.status === "CLOSED") throw new Error("Closed tickets cannot change priority");
        const nextConfig = await loadSlaConfiguration(action.priority);
        nextStatus = ticket.status;
        await tx.ticket.update({ where: { id: ticketId }, data: { priority: action.priority } });
        if (ticket.sla) {
          // Recompute from the original start, then add back the business
          // minutes of every completed pause before this priority change.
          const pausedMinutes = pausedBusinessMinutesFromEvents(
            ticket.sla.events,
            nextConfig.business,
          );
          const extend = (value: Date): Date =>
            pausedMinutes > 0
              ? addBusinessMinutes(value, pausedMinutes, nextConfig.business)
              : value;
          const first = extend(
            addBusinessMinutes(
              ticket.sla.startedAt,
              nextConfig.rule.firstResponseMinutes,
              nextConfig.business,
            ),
          );
          const resolution = extend(
            addBusinessMinutes(
              ticket.sla.startedAt,
              nextConfig.rule.resolutionMinutes,
              nextConfig.business,
            ),
          );
          const state = ticket.sla.pausedAt
            ? "PAUSED"
            : evaluateSlaState(
                {
                  startedAt: ticket.sla.startedAt,
                  firstResponseDueAt: first,
                  resolutionDueAt: resolution,
                  firstRespondedAt: ticket.sla.firstRespondedAt,
                  resolvedAt: ticket.sla.resolvedAt,
                  pausedAt: null,
                  accumulatedPauseSec: ticket.sla.accumulatedPauseSec,
                },
                now,
                nextConfig.rule.resolutionMinutes,
                nextConfig.rule.escalationPct,
                nextConfig.business,
              );
          await tx.ticketSla.update({
            where: { id: ticket.sla.id },
            data: {
              ruleId: nextConfig.rule.id,
              calendarId: nextConfig.calendar.id,
              firstResponseDueAt: first,
              resolutionDueAt: resolution,
              state,
            },
          });
        }
        auditAction = "TICKET_PRIORITY_CHANGED";
        auditAfter = { priority: action.priority };
        break;
      }
    }

    await writeAudit(tx, actor, auditAction, ticketId, snapshot, auditAfter);
    return { status: nextStatus };
  });
}

async function loadSlaConfigurationForTicketSafe(
  ruleId: string,
  calendarId: string,
): Promise<SlaConfiguration> {
  return loadSlaConfigurationForTicket(ruleId, calendarId);
}
