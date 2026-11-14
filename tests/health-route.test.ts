import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { $queryRaw: vi.fn() },
}));

import { prisma } from "@/lib/db";
import { GET } from "@/app/api/health/route";

describe("health endpoint", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns only minimal health status", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as never);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns a generic unhealthy response without database details", async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error("private database detail"));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "error" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
