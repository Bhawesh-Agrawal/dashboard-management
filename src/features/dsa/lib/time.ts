import { formatDateOnly, getTodayInTimezone, parseDateOnly } from "@/lib/timezone";

/** Single default timezone constant for the DSA module. */
export const DSA_DEFAULT_TIMEZONE = "Asia/Kathmandu";

/**
 * Computes "today" as a YYYY-MM-DD calendar date string in the owner's timezone.
 * All DSA "today" calculations go through this single function.
 */
export function dsaToday(
  now: Date = new Date(),
  tz: string = DSA_DEFAULT_TIMEZONE
): string {
  return getTodayInTimezone(tz, now);
}

/**
 * Formats a Date or string to strict YYYY-MM-DD date-only string.
 */
export function dsaDateStr(input: Date | string): string {
  return formatDateOnly(input);
}

/**
 * Parses a YYYY-MM-DD string into a UTC midnight Date for Postgres @db.Date columns.
 */
export function dsaParseDate(dateStr: string): Date {
  return parseDateOnly(dateStr);
}

/**
 * Adds a signed integer number of calendar days to a YYYY-MM-DD string.
 */
export function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 0, 0, 0, 0));
  return dt.toISOString().slice(0, 10);
}

/**
 * Difference in calendar days: a - b (positive when a is after b).
 */
export function diffCalendarDays(aDateStr: string, bDateStr: string): number {
  const a = parseDateOnly(aDateStr).getTime();
  const b = parseDateOnly(bDateStr).getTime();
  return Math.round((a - b) / (24 * 60 * 60 * 1000));
}

/**
 * Returns the Monday (YYYY-MM-DD) of the week containing `dateStr` (Mon-Sun week).
 */
export function getWeekStartMonday(dateStr: string): string {
  const dt = parseDateOnly(dateStr);
  const day = dt.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const offset = day === 0 ? -6 : 1 - day;
  return addDaysToDateStr(dateStr, offset);
}
