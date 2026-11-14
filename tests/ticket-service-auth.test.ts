import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

import { applyTicketAction } from "@/lib/tickets";

describe("ticket action service authorization", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects employees before looking up or mutating a ticket", async () => {
    await expect(
      applyTicketAction("ticket-id", {
        employeeId: "employee-id",
        role: "EMPLOYEE",
        name: "Employee",
      }, { type: "start" }),
    ).rejects.toThrow("Only HR staff can update tickets");
  });

  it("continues to reject auditors explicitly", async () => {
    await expect(
      applyTicketAction("ticket-id", {
        employeeId: "auditor-id",
        role: "AUDITOR",
        name: "Auditor",
      }, { type: "start" }),
    ).rejects.toThrow("Auditors have read-only access");
  });
});
