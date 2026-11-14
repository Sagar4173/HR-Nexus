/**
 * Next ticket number for a given year, based on the highest existing suffix
 * rather than the row count. This avoids reusing numbers after deletions.
 */
export function nextTicketNumber(latest: string | null, year: string): string {
  const prefix = `HR-${year}-`;
  const suffix =
    latest && latest.startsWith(prefix)
      ? Number.parseInt(latest.slice(prefix.length), 10)
      : 0;
  const next = Number.isSafeInteger(suffix) && suffix >= 1 ? suffix + 1 : 1;
  return `${prefix}${String(next).padStart(6, "0")}`;
}
