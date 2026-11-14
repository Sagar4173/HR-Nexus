import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieValue: undefined as string | undefined,
  findUnique: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: mocks.cookieValue }) }),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { employee: { findUnique: mocks.findUnique } } }));

import { createSessionToken, getSession, SESSION_COOKIE } from "@/lib/auth";

describe("session role freshness", () => {
  afterEach(() => {
    vi.clearAllMocks();
    mocks.cookieValue = undefined;
  });

  it("uses the current active employee role instead of the cookie role", async () => {
    process.env.SESSION_SECRET = "test-session-secret-at-least-16";
    mocks.cookieValue = createSessionToken({
      employeeId: "employee-id",
      employeeNo: "EMP-1",
      name: "Old Name",
      role: "EMPLOYEE",
    }).token;
    mocks.findUnique.mockResolvedValue({
      employeeNo: "EMP-1",
      firstName: "New",
      lastName: "Name",
      role: "HR_ADMIN",
      status: "ACTIVE",
    });

    await expect(getSession()).resolves.toMatchObject({ role: "HR_ADMIN", name: "New Name" });
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { id: "employee-id" },
      select: { employeeNo: true, firstName: true, lastName: true, role: true, status: true },
    });
    expect(SESSION_COOKIE).toBe("hrnexus_session");
  });

  it("rejects sessions for inactive employees", async () => {
    process.env.SESSION_SECRET = "test-session-secret-at-least-16";
    mocks.cookieValue = createSessionToken({
      employeeId: "employee-id",
      employeeNo: "EMP-1",
      name: "Employee",
      role: "EMPLOYEE",
    }).token;
    mocks.findUnique.mockResolvedValue({
      employeeNo: "EMP-1",
      firstName: "Employee",
      lastName: "One",
      role: "EMPLOYEE",
      status: "INACTIVE",
    });

    await expect(getSession()).resolves.toBeNull();
  });
});
