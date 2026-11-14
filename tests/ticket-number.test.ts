import { describe, expect, it } from "vitest";

import { nextTicketNumber } from "@/lib/ticket-number";

describe("ticket numbering", () => {
  it("starts at one when the year has no tickets", () => {
    expect(nextTicketNumber(null, "2026")).toBe("HR-2026-000001");
  });

  it("increments the highest suffix rather than the row count", () => {
    expect(nextTicketNumber("HR-2026-000041", "2026")).toBe("HR-2026-000042");
    expect(nextTicketNumber("HR-2026-000099", "2026")).toBe("HR-2026-000100");
  });

  it("ignores tickets from another year", () => {
    expect(nextTicketNumber("HR-2025-000900", "2026")).toBe("HR-2026-000001");
  });

  it("recovers from a malformed suffix", () => {
    expect(nextTicketNumber("HR-2026-unknown", "2026")).toBe("HR-2026-000001");
  });
});
