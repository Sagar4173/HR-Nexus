import { formatInTimeZone } from "date-fns-tz";

export const OPERATIONAL_TIME_ZONE = "Asia/Kolkata";

/** Convert an instant to the UTC-midnight value used by PostgreSQL `date` columns. */
export function toDateOnly(value: Date, timeZone = OPERATIONAL_TIME_ZONE): Date {
  return new Date(`${formatInTimeZone(value, timeZone, "yyyy-MM-dd")}T00:00:00.000Z`);
}

/** Format a database date-only value (stored as UTC midnight) as `yyyy-MM-dd`. */
export function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** A policy version is effective on a day when `effectiveFrom <= day <= effectiveTo`. */
export function isVersionEffectiveOn(
  version: { status: string; effectiveFrom: Date; effectiveTo: Date | null },
  asOf: Date,
  timeZone = OPERATIONAL_TIME_ZONE,
): boolean {
  if (version.status === "DRAFT") return false;
  const day = toDateOnly(asOf, timeZone).getTime();
  return (
    version.effectiveFrom.getTime() <= day &&
    (!version.effectiveTo || version.effectiveTo.getTime() >= day)
  );
}
