import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

export type SlaState = "ON_TRACK" | "AT_RISK" | "BREACHED" | "MET" | "PAUSED";

export type BusinessCalendar = {
  timeZone: string;
  workdays: number[];
  startMinute: number;
  endMinute: number;
  holidays: Set<string>;
};

export function parseWorkdays(value: string): number[] {
  return value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isInteger(part) && part >= 1 && part <= 7);
}

function zoned(date: Date, timeZone: string): Date {
  return toZonedTime(date, timeZone);
}

function localKey(date: Date, timeZone: string): string {
  const local = zoned(date, timeZone);
  const month = String(local.getMonth() + 1).padStart(2, "0");
  const day = String(local.getDate()).padStart(2, "0");
  return `${local.getFullYear()}-${month}-${day}`;
}

function localWeekday(date: Date, timeZone: string): number {
  const day = zoned(date, timeZone).getDay();
  return day === 0 ? 7 : day;
}

function partOfDay(minuteOfDay: number): { hours: number; minutes: number } {
  return { hours: Math.floor(minuteOfDay / 60), minutes: minuteOfDay % 60 };
}

function atLocalMinute(
  date: Date,
  timeZone: string,
  minuteOfDay: number,
  dayOffset = 0,
): Date {
  const local = zoned(date, timeZone);
  const { hours, minutes } = partOfDay(minuteOfDay);
  const wallClock = new Date(
    local.getFullYear(),
    local.getMonth(),
    local.getDate() + dayOffset,
    hours,
    minutes,
    0,
    0,
  );
  return fromZonedTime(wallClock, timeZone);
}

export function isBusinessDay(date: Date, calendar: BusinessCalendar): boolean {
  if (!calendar.workdays.includes(localWeekday(date, calendar.timeZone))) return false;
  return !calendar.holidays.has(localKey(date, calendar.timeZone));
}

/** The first working instant at or after `value`, clipped into business hours. */
export function nextBusinessStart(value: Date, calendar: BusinessCalendar): Date {
  const startOfDay = atLocalMinute(value, calendar.timeZone, calendar.startMinute);
  if (isBusinessDay(value, calendar) && value >= startOfDay) {
    const endOfDay = atLocalMinute(value, calendar.timeZone, calendar.endMinute);
    if (value < endOfDay) return value;
  }
  for (let offset = 0; offset < 400; offset += 1) {
    const dayStart = atLocalMinute(value, calendar.timeZone, calendar.startMinute, offset);
    if (
      isBusinessDay(dayStart, calendar) &&
      dayStart.getTime() >= value.getTime()
    ) {
      return dayStart;
    }
  }
  throw new Error("Could not find the next business day within 400 days");
}

function nextBusinessDayStart(cursor: Date, calendar: BusinessCalendar): Date {
  for (let offset = 1; offset <= 400; offset += 1) {
    const candidate = atLocalMinute(cursor, calendar.timeZone, calendar.startMinute, offset);
    if (isBusinessDay(candidate, calendar)) return candidate;
  }
  throw new Error("Could not find the next business day within 400 days");
}

/** Add working minutes using the configured calendar, skipping weekends and holidays. */
export function addBusinessMinutes(
  start: Date,
  minutes: number,
  calendar: BusinessCalendar,
): Date {
  if (!Number.isFinite(minutes) || minutes < 0) {
    throw new Error("minutes must be a non-negative number");
  }
  const dayMinutes = calendar.endMinute - calendar.startMinute;
  let cursor = nextBusinessStart(start, calendar);
  let remaining = minutes;

  for (let guard = 0; guard < 500; guard += 1) {
    if (remaining <= 0) return cursor;
    const local = zoned(cursor, calendar.timeZone);
    const minutesIntoDay = local.getHours() * 60 + local.getMinutes() - calendar.startMinute;
    const available = dayMinutes - Math.max(0, minutesIntoDay);
    if (remaining <= available) {
      return new Date(cursor.getTime() + remaining * 60_000);
    }
    remaining -= available;
    cursor = nextBusinessDayStart(cursor, calendar);
  }
  throw new Error("SLA window exceeded the maximum number of business days");
}

export type PauseExtension = {
  firstResponseDueAt: Date | null;
  resolutionDueAt: Date;
  pausedSeconds: number;
  pausedBusinessMinutes: number;
};

/**
 * Extend SLA deadlines by the business minutes consumed while paused.
 * Wall-clock pause seconds are retained for display and audit only.
 */
export function extendDeadlinesForPause(input: {
  pausedAt: Date;
  resumedAt: Date;
  firstResponseDueAt: Date | null;
  resolutionDueAt: Date;
  calendar: BusinessCalendar;
}): PauseExtension {
  const pausedSeconds = Math.max(
    0,
    Math.floor((input.resumedAt.getTime() - input.pausedAt.getTime()) / 1000),
  );
  const pausedBusinessMinutes = businessMinutesBetween(
    input.pausedAt,
    input.resumedAt,
    input.calendar,
  );
  const extend = (value: Date): Date =>
    pausedBusinessMinutes > 0
      ? addBusinessMinutes(value, pausedBusinessMinutes, input.calendar)
      : value;

  return {
    firstResponseDueAt: input.firstResponseDueAt
      ? extend(input.firstResponseDueAt)
      : null,
    resolutionDueAt: extend(input.resolutionDueAt),
    pausedSeconds,
    pausedBusinessMinutes,
  };
}

export type SlaPauseEvent = {
  type: string;
  occurredAt: Date;
};

/**
 * Sum the business minutes of completed PAUSED -> RESUMED pairs.
 * A trailing PAUSED event represents the still-open pause and is not counted.
 */
export function pausedBusinessMinutesFromEvents(
  events: SlaPauseEvent[],
  calendar: BusinessCalendar,
): number {
  let total = 0;
  let pausedAt: Date | null = null;
  const ordered = [...events].sort(
    (left, right) => left.occurredAt.getTime() - right.occurredAt.getTime(),
  );
  for (const event of ordered) {
    if (event.type === "PAUSED") {
      pausedAt = event.occurredAt;
    } else if (event.type === "RESUMED" && pausedAt) {
      total += businessMinutesBetween(pausedAt, event.occurredAt, calendar);
      pausedAt = null;
    }
  }
  return total;
}

/** Convert configured holiday dates into calendar keys in the operational timezone. */
export function businessHolidayKeys(
  holidays: Array<{ date: Date }>,
  timeZone: string,
): Set<string> {
  return new Set(
    holidays.map((holiday) => formatInTimeZone(holiday.date, timeZone, "yyyy-MM-dd")),
  );
}

export type SlaEvaluationInput = {
  startedAt: Date;
  firstResponseDueAt: Date;
  resolutionDueAt: Date;
  firstRespondedAt: Date | null;
  resolvedAt: Date | null;
  pausedAt: Date | null;
  accumulatedPauseSec: number;
};

export function evaluateSlaState(
  sla: SlaEvaluationInput,
  now: Date,
  resolutionMinutes: number,
  escalationPct: number,
  calendar: BusinessCalendar,
): SlaState {
  if (sla.pausedAt) return "PAUSED";
  if (sla.resolvedAt) {
    return sla.resolvedAt.getTime() <= sla.resolutionDueAt.getTime() ? "MET" : "BREACHED";
  }
  if (now.getTime() > sla.resolutionDueAt.getTime()) return "BREACHED";
  // Use the actual (possibly pause-extended) resolution window so the risk
  // threshold moves with the deadline instead of the original rule duration.
  const windowMinutes = Math.max(
    resolutionMinutes,
    businessMinutesBetween(sla.startedAt, sla.resolutionDueAt, calendar),
  );
  const riskAt = addBusinessMinutes(
    sla.startedAt,
    Math.floor((windowMinutes * escalationPct) / 100),
    calendar,
  );
  return now.getTime() > riskAt.getTime() ? "AT_RISK" : "ON_TRACK";
}

/** Minutes of business time between two instants, rounded up. */
export function businessMinutesBetween(
  start: Date,
  end: Date,
  calendar: BusinessCalendar,
): number {
  if (end <= start) return 0;
  let cursor = nextBusinessStart(start, calendar);
  let total = 0;
  for (let guard = 0; guard < 500 && cursor < end; guard += 1) {
    const dayEnd = atLocalMinute(cursor, calendar.timeZone, calendar.endMinute);
    const boundary = end < dayEnd ? end : dayEnd;
    total += Math.max(0, Math.ceil((boundary.getTime() - cursor.getTime()) / 60_000));
    if (end <= dayEnd) break;
    cursor = nextBusinessDayStart(cursor, calendar);
  }
  return total;
}
