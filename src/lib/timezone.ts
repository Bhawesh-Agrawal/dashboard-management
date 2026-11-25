export const DEFAULT_TIMEZONE = "Asia/Kathmandu";

export type DayOfWeekCode = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

const DOW_CODE_MAP: Record<string, DayOfWeekCode> = {
  Mon: "MON",
  Tue: "TUE",
  Wed: "WED",
  Thu: "THU",
  Fri: "FRI",
  Sat: "SAT",
  Sun: "SUN",
};

/**
 * Converts a Date or ISO string into a strict date-only "YYYY-MM-DD" string.
 */
export function formatDateOnly(input: Date | string): string {
  if (typeof input === "string") {
    const match = input.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const d = typeof input === "string" ? new Date(input) : input;
  return d.toISOString().slice(0, 10);
}

/**
 * Parses a date-only string ("YYYY-MM-DD") into a Date at UTC midnight.
 * Guarantees zero local browser/server timezone skew when storing in Postgres @db.Date.
 */
export function parseDateOnly(dateStr: string): Date {
  const [year, month, day] = dateStr.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

/**
 * Gets the current date string ("YYYY-MM-DD") in the specified timezone.
 */
export function getTodayInTimezone(timezone: string = DEFAULT_TIMEZONE, now?: Date): string {
  const date = now ?? new Date();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Gets the current day of the week in the specified timezone.
 */
export function getDayOfWeekInTimezone(
  timezone: string = DEFAULT_TIMEZONE,
  now?: Date
): DayOfWeekCode {
  const date = now ?? new Date();
  const shortDay = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).format(date);
  return DOW_CODE_MAP[shortDay] ?? "MON";
}

/**
 * Returns the current time components in the specified timezone.
 */
export function getTimeInTimezone(
  timezone: string = DEFAULT_TIMEZONE,
  now?: Date
): { hour: number; minute: number; timeStr: string; minutesSinceMidnight: number } {
  const date = now ?? new Date();
  const timeStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);

  const [hour, minute] = timeStr.split(":").map(Number);
  return {
    hour,
    minute,
    timeStr,
    minutesSinceMidnight: hour * 60 + minute,
  };
}

export type ClassTimingStatus = "upcoming" | "in_progress" | "ended";

/**
 * Computes whether a class occurrence on a specific date is upcoming, in progress, or ended
 * evaluated in the user's timezone.
 */
export function getClassTimingStatus({
  date,
  startTime,
  endTime,
  timezone = DEFAULT_TIMEZONE,
  now,
}: {
  date: string;
  startTime: string;
  endTime: string;
  timezone?: string;
  now?: Date;
}): ClassTimingStatus {
  const today = getTodayInTimezone(timezone, now);

  if (date < today) {
    return "ended";
  }
  if (date > today) {
    return "upcoming";
  }

  // Same day: compare times
  const { minutesSinceMidnight: currentMinutes } = getTimeInTimezone(timezone, now);
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);

  const startMinutes = startH * 60 + startM;
  let endMinutes = endH * 60 + endM;

  // Handle late evening classes crossing midnight (e.g., 23:30 to 00:30)
  if (endMinutes < startMinutes) {
    endMinutes += 24 * 60;
  }

  if (currentMinutes < startMinutes) {
    return "upcoming";
  }
  if (currentMinutes <= endMinutes) {
    return "in_progress";
  }
  return "ended";
}
