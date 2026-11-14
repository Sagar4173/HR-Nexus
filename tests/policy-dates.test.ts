import { describe, expect, it } from "vitest";

import {
  isVersionEffectiveOn,
  toDateOnly,
} from "@/lib/policy-dates";

const IST_MIDNIGHT_WINDOW = new Date("2026-11-13T19:00:00Z"); // 14 Nov 00:30 IST

describe("policy effective dates", () => {
  it("derives the date key in the operational timezone, not UTC", () => {
    expect(toDateOnly(IST_MIDNIGHT_WINDOW).toISOString()).toBe("2026-11-14T00:00:00.000Z");
  });

  it("treats effectiveTo as inclusive on its final day", () => {
    const oneDayVersion = {
      status: "ACTIVE",
      effectiveFrom: new Date("2026-11-14T00:00:00.000Z"),
      effectiveTo: new Date("2026-11-14T00:00:00.000Z"),
    };

    expect(isVersionEffectiveOn(oneDayVersion, IST_MIDNIGHT_WINDOW)).toBe(true);
    expect(
      isVersionEffectiveOn(oneDayVersion, new Date("2026-11-14T19:00:00Z")),
    ).toBe(false);
  });

  it("selects a version that starts on the current IST day before UTC midnight", () => {
    const startsToday = {
      status: "ACTIVE",
      effectiveFrom: new Date("2026-11-14T00:00:00.000Z"),
      effectiveTo: null,
    };

    expect(isVersionEffectiveOn(startsToday, IST_MIDNIGHT_WINDOW)).toBe(true);
  });

  it("ignores draft versions", () => {
    expect(
      isVersionEffectiveOn(
        {
          status: "DRAFT",
          effectiveFrom: new Date("2026-11-14T00:00:00.000Z"),
          effectiveTo: null,
        },
        IST_MIDNIGHT_WINDOW,
      ),
    ).toBe(false);
  });
});
