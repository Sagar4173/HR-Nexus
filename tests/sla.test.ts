import { formatInTimeZone } from "date-fns-tz";
import { describe, expect, it } from "vitest";

import {
  addBusinessMinutes,
  businessHolidayKeys,
  businessMinutesBetween,
  evaluateSlaState,
  extendDeadlinesForPause,
  nextBusinessStart,
  pausedBusinessMinutesFromEvents,
  type BusinessCalendar,
} from "@/lib/sla";

const IST = "Asia/Kolkata";

function calendar(holidays: string[] = []): BusinessCalendar {
  return {
    timeZone: IST,
    workdays: [1, 2, 3, 4, 5],
    startMinute: 9 * 60,
    endMinute: 18 * 60,
    holidays: new Set(holidays),
  };
}

function ist(value: Date): string {
  return formatInTimeZone(value, IST, "yyyy-MM-dd HH:mm");
}

describe("business-hours arithmetic", () => {
  it("adds minutes inside the same business day", () => {
    const start = new Date("2026-11-13T04:00:00Z"); // Fri 09:30 IST
    expect(ist(addBusinessMinutes(start, 120, calendar()))).toBe("2026-11-13 11:30");
  });

  it("rolls over the weekend", () => {
    const start = new Date("2026-11-13T11:30:00Z"); // Fri 17:00 IST
    expect(ist(addBusinessMinutes(start, 120, calendar()))).toBe("2026-11-16 10:00");
  });

  it("skips holidays", () => {
    const start = new Date("2026-11-13T11:30:00Z"); // Fri 17:00 IST
    expect(ist(addBusinessMinutes(start, 120, calendar(["2026-11-16"])))).toBe(
      "2026-11-17 10:00",
    );
  });

  it("moves weekend and after-hours starts to the next business morning", () => {
    const saturday = new Date("2026-11-14T06:30:00Z"); // Sat 12:00 IST
    expect(ist(nextBusinessStart(saturday, calendar()))).toBe("2026-11-16 09:00");

    const evening = new Date("2026-11-13T13:30:00Z"); // Fri 19:00 IST
    expect(ist(nextBusinessStart(evening, calendar()))).toBe("2026-11-16 09:00");
  });

  it("counts business minutes across a weekend", () => {
    const friday = new Date("2026-11-13T11:30:00Z"); // Fri 17:00 IST
    const monday = new Date("2026-11-16T04:30:00Z"); // Mon 10:00 IST
    expect(businessMinutesBetween(friday, monday, calendar())).toBe(120);
  });

  it("returns zero when the range is empty or reversed", () => {
    const value = new Date("2026-11-13T04:00:00Z");
    expect(businessMinutesBetween(value, value, calendar())).toBe(0);
    expect(businessMinutesBetween(value, new Date(value.getTime() - 60_000), calendar())).toBe(0);
  });

  it("rejects negative minute input", () => {
    expect(() => addBusinessMinutes(new Date(), -1, calendar())).toThrow();
  });

  it("extends deadlines by paused business minutes, not wall-clock time", () => {
    const pausedAt = new Date("2026-11-13T11:30:00Z"); // Fri 17:00 IST
    const resumedAt = new Date("2026-11-16T04:30:00Z"); // Mon 10:00 IST
    const due = new Date("2026-11-13T11:30:00Z"); // Fri 17:00 IST
    const result = extendDeadlinesForPause({
      pausedAt,
      resumedAt,
      firstResponseDueAt: due,
      resolutionDueAt: due,
      calendar: calendar(),
    });

    expect(result.pausedBusinessMinutes).toBe(120);
    expect(result.pausedSeconds).toBe(65 * 60 * 60);
    expect(ist(result.firstResponseDueAt!)).toBe("2026-11-16 10:00");
    expect(ist(result.resolutionDueAt)).toBe("2026-11-16 10:00");
  });

  it("sums completed pause events and ignores a trailing open pause", () => {
    const events = [
      { type: "STARTED", occurredAt: new Date("2026-11-13T04:00:00Z") },
      { type: "PAUSED", occurredAt: new Date("2026-11-13T11:30:00Z") }, // Fri 17:00
      { type: "RESUMED", occurredAt: new Date("2026-11-16T04:30:00Z") }, // Mon 10:00
      { type: "PAUSED", occurredAt: new Date("2026-11-17T04:00:00Z") }, // Tue 09:30
    ];

    expect(pausedBusinessMinutesFromEvents(events, calendar())).toBe(120);
  });

  it("sorts pause events before pairing them and skips holidays", () => {
    const events = [
      { type: "RESUMED", occurredAt: new Date("2026-11-17T04:30:00Z") }, // Tue 10:00
      { type: "PAUSED", occurredAt: new Date("2026-11-13T11:30:00Z") }, // Fri 17:00
    ];

    expect(
      pausedBusinessMinutesFromEvents(events, calendar(["2026-11-16"])),
    ).toBe(120);
  });

  it("derives holiday keys in the calendar timezone", () => {
    const keys = businessHolidayKeys(
      [{ date: new Date("2026-11-16T00:00:00Z") }],
      IST,
    );
    expect([...keys]).toEqual(["2026-11-16"]);
  });
});

describe("evaluateSlaState", () => {
  const start = new Date("2026-11-13T10:30:00Z"); // Fri 16:00 IST
  const firstResponseDueAt = new Date("2026-11-13T11:00:00Z"); // Fri 16:30 IST
  const resolutionDueAt = new Date("2026-11-13T11:30:00Z"); // Fri 17:00 IST

  const base = {
    startedAt: start,
    firstResponseDueAt,
    resolutionDueAt,
    firstRespondedAt: start,
    resolvedAt: null,
    pausedAt: null,
    accumulatedPauseSec: 0,
  };

  it("is on track before the 75% risk threshold", () => {
    expect(
      evaluateSlaState(base, new Date("2026-11-13T10:50:00Z"), 60, 75, calendar()),
    ).toBe("ON_TRACK");
  });

  it("is at risk after the escalation threshold", () => {
    expect(
      evaluateSlaState(base, new Date("2026-11-13T11:20:00Z"), 60, 75, calendar()),
    ).toBe("AT_RISK");
  });

  it("breaches once the resolution deadline passes", () => {
    expect(
      evaluateSlaState(base, new Date("2026-11-13T11:31:00Z"), 60, 75, calendar()),
    ).toBe("BREACHED");
  });

  it("marks a timely resolution as met", () => {
    const resolved = { ...base, resolvedAt: new Date("2026-11-13T11:25:00Z") };
    expect(evaluateSlaState(resolved, new Date("2026-11-13T13:00:00Z"), 60, 75, calendar())).toBe(
      "MET",
    );
  });

  it("marks a late resolution as breached", () => {
    const resolved = { ...base, resolvedAt: new Date("2026-11-13T11:45:00Z") };
    expect(evaluateSlaState(resolved, new Date("2026-11-13T13:00:00Z"), 60, 75, calendar())).toBe(
      "BREACHED",
    );
  });

  it("pauses while waiting on the employee", () => {
    const paused = { ...base, pausedAt: new Date("2026-11-13T10:45:00Z") };
    expect(evaluateSlaState(paused, new Date("2026-11-14T10:00:00Z"), 60, 75, calendar())).toBe(
      "PAUSED",
    );
  });

  it("moves the at-risk threshold with a pause-extended deadline", () => {
    const start = new Date("2026-11-13T10:30:00Z"); // Fri 16:00 IST
    const extended = {
      ...base,
      startedAt: start,
      // Fri 16:00 -> Mon 10:00 is 180 business minutes (120 + 60).
      resolutionDueAt: new Date("2026-11-16T04:30:00Z"),
      accumulatedPauseSec: 65 * 60 * 60,
    };

    // 75% of 180 business minutes is Mon 09:15 IST.
    expect(
      evaluateSlaState(extended, new Date("2026-11-13T10:50:00Z"), 60, 75, calendar()),
    ).toBe("ON_TRACK");
    expect(
      evaluateSlaState(extended, new Date("2026-11-16T03:50:00Z"), 60, 75, calendar()),
    ).toBe("AT_RISK");
  });
});
