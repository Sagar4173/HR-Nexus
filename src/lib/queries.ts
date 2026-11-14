import { formatInTimeZone } from "date-fns-tz";

import { Prisma } from "@/generated/prisma/client";
import type { Role, TicketStatus } from "@/generated/prisma/enums";

import {
  canViewTicket,
  isUuid,
  ticketScopeFor,
  visibleMessageVisibilities,
} from "./access";
import type { Session } from "./auth";
import { prisma } from "./db";
import { normalizePage } from "./format";

export function ticketScope(session: Session): Prisma.TicketWhereInput {
  return ticketScopeFor(session.role, session.employeeId);
}

export type TicketListFilters = {
  status?: string;
  priority?: string;
  queue?: string;
  sensitivity?: string;
  q?: string;
  page?: number;
};

export const TICKET_STATUSES = [
  "NEW",
  "TRIAGED",
  "ASSIGNED",
  "IN_PROGRESS",
  "WAITING_EMPLOYEE",
  "WAITING_HR",
  "ESCALATED",
  "RESOLVED",
  "CLOSED",
] as const;

export const PRIORITIES = ["P1", "P2", "P3", "P4"] as const;

function buildTicketWhere(
  session: Session,
  filters: TicketListFilters,
): Prisma.TicketWhereInput {
  const conditions: Prisma.TicketWhereInput[] = [ticketScope(session)];
  if (filters.status && TICKET_STATUSES.includes(filters.status as (typeof TICKET_STATUSES)[number])) {
    conditions.push({ status: filters.status as Prisma.EnumTicketStatusFilter["equals"] });
  }
  if (filters.priority && PRIORITIES.includes(filters.priority as (typeof PRIORITIES)[number])) {
    conditions.push({ priority: filters.priority as Prisma.EnumPriorityFilter["equals"] });
  }
  if (filters.queue) conditions.push({ queue: { slug: filters.queue } });
  if (filters.sensitivity === "sensitive") conditions.push({ isSensitive: true });
  if (filters.sensitivity === "standard") conditions.push({ isSensitive: false });
  if (filters.q) {
    conditions.push({
      OR: [
        { ticketNo: { contains: filters.q, mode: "insensitive" } },
        { subject: { contains: filters.q, mode: "insensitive" } },
        { requester: { firstName: { contains: filters.q, mode: "insensitive" } } },
        { requester: { lastName: { contains: filters.q, mode: "insensitive" } } },
      ],
    });
  }
  return { AND: conditions };
}

export async function listTickets(session: Session, filters: TicketListFilters) {
  const page = normalizePage(filters.page);
  const pageSize = 20;
  const where = buildTicketWhere(session, filters);
  const [total, rows] = await Promise.all([
    prisma.ticket.count({ where }),
    prisma.ticket.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        ticketNo: true,
        subject: true,
        status: true,
        priority: true,
        isSensitive: true,
        sensitivity: true,
        createdAt: true,
        updatedAt: true,
        requester: { select: { firstName: true, lastName: true, employeeNo: true } },
        assignee: { select: { firstName: true, lastName: true } },
        queue: { select: { slug: true, name: true, isRestricted: true } },
        category: { select: { name: true } },
        sla: { select: { state: true, resolutionDueAt: true } },
      },
    }),
  ]);
  return { rows, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getTicketDetail(ticketId: string, session: Session) {
  if (!isUuid(ticketId)) return null;
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      requester: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          employeeNo: true,
          locationCountry: true,
          employmentType: true,
          department: { select: { name: true, code: true } },
        },
      },
      assignee: { select: { id: true, firstName: true, lastName: true, role: true } },
      queue: true,
      category: true,
      messages: {
        where: { visibility: { in: visibleMessageVisibilities(session.role) } },
        orderBy: { createdAt: "asc" },
        include: {
          sender: { select: { firstName: true, lastName: true, role: true } },
          citations: {
            include: {
              policyChunk: { select: { heading: true, ordinal: true } },
              policyVersion: {
                select: {
                  id: true,
                  versionLabel: true,
                  effectiveFrom: true,
                  effectiveTo: true,
                  policyDocument: { select: { id: true, code: true, title: true } },
                },
              },
            },
          },
          aiRun: { select: { kind: true, status: true, provider: true, model: true, latencyMs: true } },
        },
      },
      assignments: {
        orderBy: { assignedAt: "desc" },
        include: { assignee: { select: { firstName: true, lastName: true } } },
      },
      sla: { include: { rule: true, calendar: true, events: { orderBy: { occurredAt: "desc" } } } },
      escalations: { orderBy: { createdAt: "desc" } },
      resolution: { include: { resolvedBy: { select: { firstName: true, lastName: true } } } },
      aiRuns: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });

  if (!ticket) return null;
  if (session.role === "EMPLOYEE" && ticket.requesterId !== session.employeeId) return null;
  if (!canViewTicket(session.role, ticket)) return null;

  const audit = await prisma.auditEvent.findMany({
    where: { entityType: "Ticket", entityId: ticket.id },
    orderBy: { createdAt: "desc" },
    take: 40,
  });

  return { ticket, audit };
}

export async function getDashboard(session: Session) {
  const scope = ticketScope(session);
  const openStatuses: TicketStatus[] = ["RESOLVED", "CLOSED"];
  const openFilter = { notIn: openStatuses };
  const [total, open, sensitive, sensitiveRestricted, resolved, citations, slaCounts, statusCounts, priorityCounts, recent, anchor] =
    await Promise.all([
      prisma.ticket.count({ where: scope }),
      prisma.ticket.count({ where: { AND: [scope, { status: openFilter }] } }),
      prisma.ticket.count({ where: { AND: [scope, { isSensitive: true }] } }),
      prisma.ticket.count({
        where: { AND: [scope, { isSensitive: true, queue: { slug: "er-restricted" } }] },
      }),
      prisma.ticket.count({ where: { AND: [scope, { status: { in: ["RESOLVED", "CLOSED"] } }] } }),
      prisma.messageCitation.groupBy({
        by: ["validated"],
        where: { message: { ticket: scope } },
        _count: true,
      }),
      prisma.ticketSla.groupBy({ by: ["state"], where: { ticket: scope }, _count: true }),
      prisma.ticket.groupBy({ by: ["status"], where: scope, _count: true }),
      prisma.ticket.groupBy({ by: ["priority"], where: scope, _count: true }),
      prisma.ticket.findMany({
        where: scope,
        orderBy: { updatedAt: "desc" },
        take: 8,
        select: {
          id: true,
          ticketNo: true,
          subject: true,
          status: true,
          priority: true,
          isSensitive: true,
          updatedAt: true,
          requester: { select: { firstName: true, lastName: true } },
          queue: { select: { name: true, isRestricted: true } },
        },
      }),
      prisma.ticket.aggregate({ where: scope, _max: { updatedAt: true } }),
    ]);

  const queueGroups = await prisma.ticket.groupBy({
    by: ["queueId"],
    where: { AND: [scope, { status: openFilter }] },
    _count: true,
  });
  const queues = await prisma.queue.findMany({
    where: session.role === "HR_AGENT" ? { isRestricted: false } : undefined,
    select: {
      id: true,
      slug: true,
      name: true,
      isRestricted: true,
      _count: { select: { employees: true } },
    },
  });
  const queueMap = new Map(queues.map((queue) => [queue.id, queue]));
  const queueWorkload = queueGroups
    .flatMap((group) => {
      const queue = queueMap.get(group.queueId);
      return queue ? [{ queue, open: Number(group._count) }] : [];
    })
    .sort((left, right) => right.open - left.open);

  const anchorDate = anchor._max.updatedAt ?? new Date();
  const start = new Date(anchorDate.getTime() - 13 * 86_400_000);
  const volumeRows = await prisma.ticket.findMany({
    where: { AND: [scope, { createdAt: { gte: start } }] },
    select: { createdAt: true },
  });
  const volumeMap = new Map<string, number>();
  for (let index = 0; index < 14; index += 1) {
    const day = new Date(start.getTime() + index * 86_400_000);
    volumeMap.set(formatInTimeZone(day, "Asia/Kolkata", "yyyy-MM-dd"), 0);
  }
  for (const row of volumeRows) {
    const key = formatInTimeZone(row.createdAt, "Asia/Kolkata", "yyyy-MM-dd");
    volumeMap.set(key, (volumeMap.get(key) ?? 0) + 1);
  }
  const volume = [...volumeMap.entries()].map(([day, count]) => ({ day, count }));

  const citationMap = new Map(citations.map((row) => [row.validated, row._count]));
  const valid = citationMap.get("VALID") ?? 0;
  const invalid = citationMap.get("INVALID") ?? 0;
  const slaMap = new Map(slaCounts.map((row) => [row.state, row._count]));
  const met = slaMap.get("MET") ?? 0;
  const breached = slaMap.get("BREACHED") ?? 0;

  return {
    totals: {
      total,
      open,
      resolved,
      sensitive,
      sensitiveRestricted,
      routingRate: sensitive > 0 ? sensitiveRestricted / sensitive : 1,
      citationValid: valid,
      citationInvalid: invalid,
      citationRate: valid + invalid > 0 ? valid / (valid + invalid) : 1,
      slaAtRisk: slaMap.get("AT_RISK") ?? 0,
      slaBreached: breached,
      slaPaused: slaMap.get("PAUSED") ?? 0,
      slaMet: met,
      slaCompliance: met + breached > 0 ? met / (met + breached) : 1,
    },
    statusCounts,
    priorityCounts,
    queueWorkload,
    recent,
    volume,
    anchorDate,
  };
}

export async function listPolicies(search?: string) {
  return prisma.policyDocument.findMany({
    where: search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" } },
            { code: { contains: search, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { code: "asc" },
    include: {
      category: { select: { name: true, slug: true } },
      versions: {
        orderBy: { effectiveFrom: "desc" },
        select: {
          id: true,
          versionLabel: true,
          status: true,
          effectiveFrom: true,
          effectiveTo: true,
        },
      },
    },
  });
}

export async function getPolicyDetail(documentId: string) {
  if (!isUuid(documentId)) return null;
  return prisma.policyDocument.findUnique({
    where: { id: documentId },
    include: {
      category: true,
      ownerDepartment: true,
      versions: {
        orderBy: { effectiveFrom: "desc" },
        include: {
          audienceRules: true,
          chunks: { orderBy: { ordinal: "asc" } },
          _count: { select: { chunks: true, citations: true } },
        },
      },
    },
  });
}

export async function getSlaOverview(session: Session) {
  const scope = ticketScope(session);
  const [counts, openTotal, openTickets, rules, calendar] = await Promise.all([
    prisma.ticketSla.groupBy({ by: ["state"], where: { ticket: scope }, _count: true }),
    prisma.ticket.count({
      where: { AND: [scope, { status: { notIn: ["RESOLVED", "CLOSED"] } }] },
    }),
    prisma.ticket.findMany({
      where: { AND: [scope, { status: { notIn: ["RESOLVED", "CLOSED"] } }] },
      orderBy: { sla: { resolutionDueAt: "asc" } },
      take: 80,
      select: {
        id: true,
        ticketNo: true,
        subject: true,
        status: true,
        priority: true,
        isSensitive: true,
        assignee: { select: { firstName: true, lastName: true } },
        queue: { select: { name: true } },
        sla: {
          select: {
            state: true,
            firstResponseDueAt: true,
            resolutionDueAt: true,
            pausedAt: true,
            accumulatedPauseSec: true,
          },
        },
      },
    }),
    prisma.slaRule.findMany({ orderBy: { priority: "asc" } }),
    prisma.slaCalendar.findFirst({
      where: { code: "INDIA-IST" },
      include: { holidays: { orderBy: { date: "asc" } } },
    }),
  ]);
  return { counts, openTotal, openTickets, rules, calendar };
}

export async function listAuditEvents(
  session: Session,
  filters: { action?: string; entityType?: string; page?: number },
) {
  const page = normalizePage(filters.page);
  const pageSize = 40;
  const conditions: Prisma.AuditEventWhereInput[] = [];
  if (filters.action) conditions.push({ action: filters.action });
  if (filters.entityType) conditions.push({ entityType: filters.entityType });
  if (session.role === "HR_AGENT") {
    const hiddenTickets = await prisma.ticket.findMany({
      where: {
        OR: [{ isSensitive: true }, { queue: { isRestricted: true } }],
      },
      select: { id: true },
    });
    if (hiddenTickets.length > 0) {
      const hiddenIds = hiddenTickets.map((ticket) => ticket.id);
      conditions.push({
        OR: [
          { entityType: { not: "Ticket" } },
          { entityId: { notIn: hiddenIds } },
        ],
      });
    }
  }
  const where: Prisma.AuditEventWhereInput = conditions.length > 0 ? { AND: conditions } : {};
  const [total, rows, actions, entityTypes] = await Promise.all([
    prisma.auditEvent.count({ where }),
    prisma.auditEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditEvent.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
    prisma.auditEvent.findMany({
      distinct: ["entityType"],
      select: { entityType: true },
      orderBy: { entityType: "asc" },
    }),
  ]);
  return {
    rows,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    actions: actions.map((row) => row.action),
    entityTypes: entityTypes.map((row) => row.entityType),
  };
}

export async function listAssignableAgents(sensitive: boolean) {
  const roles: Role[] = sensitive ? ["ER_SPECIALIST", "HR_ADMIN"] : ["HR_AGENT", "HR_ADMIN"];
  return prisma.employee.findMany({
    where: { role: { in: roles }, status: "ACTIVE" },
    orderBy: { employeeNo: "asc" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true,
      employeeNo: true,
      queue: { select: { name: true } },
    },
  });
}

export async function listQueues() {
  return prisma.queue.findMany({ orderBy: { name: "asc" } });
}

export async function getTeam(session: Session) {
  return prisma.employee.findUnique({
    where: { id: session.employeeId },
    include: { department: true, queue: true },
  });
}

export async function listDemoAccounts(roles: Role[]) {
  const employees = await prisma.employee.findMany({
    where: { role: { in: roles }, status: "ACTIVE" },
    orderBy: { employeeNo: "asc" },
    select: {
      role: true,
      employeeNo: true,
      firstName: true,
      lastName: true,
      queue: { select: { name: true } },
    },
  });
  const byRole = new Map<Role, (typeof employees)[number]>();
  for (const employee of employees) {
    if (!byRole.has(employee.role)) byRole.set(employee.role, employee);
  }
  return roles.map((role) => byRole.get(role) ?? null);
}
