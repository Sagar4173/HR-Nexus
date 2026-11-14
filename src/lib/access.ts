import type { Prisma } from "@/generated/prisma/client";
import type { MessageVisibility, Role } from "@/generated/prisma/enums";

export type TicketAccess = {
  isSensitive: boolean;
  queue: { isRestricted: boolean };
};

export const HR_ROLES: Role[] = ["HR_AGENT", "ER_SPECIALIST", "HR_ADMIN", "AUDITOR"];
export const TICKET_ACTION_ROLES: Role[] = ["HR_AGENT", "ER_SPECIALIST", "HR_ADMIN"];

/** Query-level scope applied to every ticket list, dashboard and SLA read. */
export function ticketScopeFor(role: Role, employeeId: string): Prisma.TicketWhereInput {
  if (role === "EMPLOYEE") return { requesterId: employeeId };
  if (role === "HR_AGENT") return { isSensitive: false, queue: { isRestricted: false } };
  return {};
}

/** Decision-level check used after loading a single ticket. */
export function canViewTicket(role: Role, ticket: TicketAccess): boolean {
  if (role === "EMPLOYEE") return !ticket.isSensitive;
  if (role === "HR_AGENT") return !ticket.isSensitive && !ticket.queue.isRestricted;
  return true;
}

/** Whitelist of message visibilities a role may read. */
export function visibleMessageVisibilities(role: Role): MessageVisibility[] {
  if (role === "EMPLOYEE") return ["REQUESTER_AND_HR"];
  if (role === "HR_AGENT") return ["REQUESTER_AND_HR", "HR_ONLY"];
  return ["REQUESTER_AND_HR", "HR_ONLY", "ER_ONLY"];
}

export function canAssignRole(isSensitive: boolean, role: Role): boolean {
  if (isSensitive) return role === "ER_SPECIALIST" || role === "HR_ADMIN";
  return role === "HR_AGENT" || role === "HR_ADMIN";
}

export function isTerminalTicketStatus(status: string): boolean {
  return status === "RESOLVED" || status === "CLOSED";
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
