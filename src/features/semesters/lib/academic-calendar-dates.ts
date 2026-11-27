import { formatDateOnly } from "@/lib/timezone";
import type { AcademicCalendarKindValue } from "./calendar-types";

export interface AcademicCalendarEntryItem {
  id: string;
  semesterId: string;
  semesterName?: string;
  kind: AcademicCalendarKindValue;
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  cancelsClasses: boolean;
  followsWeekday: number | null; // 1=Mon..7=Sun
  notes?: string | null;
}

const KIND_PRIORITY: Record<AcademicCalendarKindValue, number> = {
  holiday: 0,
  no_classes: 0,
  break: 1,
  exam_period: 2,
  follows_weekday: 3,
  note: 4,
};

/**
 * Pure helper returning every academic calendar entry covering `date`
 * (inclusive), ordered deterministically:
 * holiday & no_classes first, then break, exam_period, follows_weekday, note.
 */
export function entriesForDate<
  T extends {
    kind: AcademicCalendarKindValue;
    title: string;
    startDate: Date | string;
    endDate: Date | string;
  },
>(entries: T[], date: Date | string): T[] {
  const target = formatDateOnly(date);
  return entries
    .filter((entry) => {
      const start = formatDateOnly(entry.startDate);
      const end = formatDateOnly(entry.endDate);
      return start <= target && target <= end;
    })
    .slice()
    .sort((a, b) => {
      const pa = KIND_PRIORITY[a.kind] ?? 99;
      const pb = KIND_PRIORITY[b.kind] ?? 99;
      if (pa !== pb) return pa - pb;
      const sa = formatDateOnly(a.startDate);
      const sb = formatDateOnly(b.startDate);
      if (sa !== sb) return sa.localeCompare(sb);
      return a.title.localeCompare(b.title);
    });
}

/**
 * Compute 1-based day index and total day count for a date within an entry's range.
 */
export function getEntryRangeDay(
  entry: { startDate: Date | string; endDate: Date | string },
  date: Date | string
): { day: number; totalDays: number } {
  const startStr = formatDateOnly(entry.startDate);
  const endStr = formatDateOnly(entry.endDate);
  const dateStr = formatDateOnly(date);
  const startMs = Date.parse(`${startStr}T00:00:00Z`);
  const endMs = Date.parse(`${endStr}T00:00:00Z`);
  const dateMs = Date.parse(`${dateStr}T00:00:00Z`);
  const totalDays = Math.max(1, Math.round((endMs - startMs) / 86_400_000) + 1);
  const day = Math.min(
    totalDays,
    Math.max(1, Math.round((dateMs - startMs) / 86_400_000) + 1)
  );
  return { day, totalDays };
}

const WEEKDAY_NAMES_ISO: Record<number, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

const WEEKDAY_SHORT_ISO: Record<number, string> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
  7: "Sun",
};

export function isoWeekdayName(isoDay: number | null | undefined): string {
  if (!isoDay) return "Weekday";
  return WEEKDAY_NAMES_ISO[isoDay] ?? "Weekday";
}

export function isoWeekdayShort(isoDay: number | null | undefined): string {
  if (!isoDay) return "Day";
  return WEEKDAY_SHORT_ISO[isoDay] ?? "Day";
}
