import { describe, expect, it } from "vitest";

import {
  canAssignRole,
  canViewTicket,
  isTerminalTicketStatus,
  isUuid,
  ticketScopeFor,
  visibleMessageVisibilities,
} from "@/lib/access";

const standard = { isSensitive: false, queue: { isRestricted: false } };
const restricted = { isSensitive: false, queue: { isRestricted: true } };
const sensitive = { isSensitive: true, queue: { isRestricted: true } };

describe("ticket access", () => {
  it("scopes HR agents to non-sensitive, non-restricted queues", () => {
    expect(ticketScopeFor("HR_AGENT", "employee-1")).toEqual({
      isSensitive: false,
      queue: { isRestricted: false },
    });
  });

  it("scopes employees to their own tickets", () => {
    expect(ticketScopeFor("EMPLOYEE", "employee-1")).toEqual({ requesterId: "employee-1" });
  });

  it("denies HR agents restricted-queue tickets even when they are not sensitive", () => {
    expect(canViewTicket("HR_AGENT", standard)).toBe(true);
    expect(canViewTicket("HR_AGENT", restricted)).toBe(false);
    expect(canViewTicket("HR_AGENT", sensitive)).toBe(false);
  });

  it("allows ER, admin and auditor roles to view restricted cases", () => {
    for (const role of ["ER_SPECIALIST", "HR_ADMIN", "AUDITOR"] as const) {
      expect(canViewTicket(role, restricted)).toBe(true);
      expect(canViewTicket(role, sensitive)).toBe(true);
    }
  });

  it("hides sensitive tickets from employees", () => {
    expect(canViewTicket("EMPLOYEE", standard)).toBe(true);
    expect(canViewTicket("EMPLOYEE", sensitive)).toBe(false);
  });
});

describe("message visibility", () => {
  it("only exposes requester-visible messages to employees", () => {
    expect(visibleMessageVisibilities("EMPLOYEE")).toEqual(["REQUESTER_AND_HR"]);
  });

  it("exposes HR-only notes to HR agents but not ER-only notes", () => {
    expect(visibleMessageVisibilities("HR_AGENT")).toEqual(["REQUESTER_AND_HR", "HR_ONLY"]);
  });

  it("exposes all messages to ER, admin and auditor roles", () => {
    for (const role of ["ER_SPECIALIST", "HR_ADMIN", "AUDITOR"] as const) {
      expect(visibleMessageVisibilities(role)).toEqual([
        "REQUESTER_AND_HR",
        "HR_ONLY",
        "ER_ONLY",
      ]);
    }
  });
});

describe("assignment rules", () => {
  it("allows only HR staff on standard tickets", () => {
    expect(canAssignRole(false, "HR_AGENT")).toBe(true);
    expect(canAssignRole(false, "HR_ADMIN")).toBe(true);
    expect(canAssignRole(false, "ER_SPECIALIST")).toBe(false);
    expect(canAssignRole(false, "AUDITOR")).toBe(false);
    expect(canAssignRole(false, "EMPLOYEE")).toBe(false);
  });

  it("allows only ER specialists and admins on restricted tickets", () => {
    expect(canAssignRole(true, "ER_SPECIALIST")).toBe(true);
    expect(canAssignRole(true, "HR_ADMIN")).toBe(true);
    expect(canAssignRole(true, "HR_AGENT")).toBe(false);
    expect(canAssignRole(true, "AUDITOR")).toBe(false);
    expect(canAssignRole(true, "EMPLOYEE")).toBe(false);
  });

  it("treats resolved and closed tickets as terminal", () => {
    expect(isTerminalTicketStatus("RESOLVED")).toBe(true);
    expect(isTerminalTicketStatus("CLOSED")).toBe(true);
    expect(isTerminalTicketStatus("IN_PROGRESS")).toBe(false);
  });
});

describe("uuid validation", () => {
  it("accepts canonical UUIDs and rejects malformed IDs", () => {
    expect(isUuid("2f1c0a84-6c67-4f4b-9f8b-6f3b4a7d1e22")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("2f1c0a84-6c67-4f4b-9f8b-6f3b4a7d1e2")).toBe(false);
  });
});
