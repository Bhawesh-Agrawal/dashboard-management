import type { CalendarEvent } from "@/types";
import {
  entriesForDate,
  getEntryRangeDay,
  isoWeekdayName,
  isoWeekdayShort,
  type AcademicCalendarEntryItem,
} from "@/features/semesters/lib/academic-calendar-dates";
import { formatDateOnly } from "@/lib/timezone";

export function formatAcademicShortLabel(entry: AcademicCalendarEntryItem): string {
  switch (entry.kind) {
    case "holiday":
      return "Holiday";
    case "no_classes":
      return "No classes";
    case "break":
      return "Break";
    case "exam_period":
      return "Exams";
    case "follows_weekday":
      return `Follows ${isoWeekdayShort(entry.followsWeekday)}`;
    case "note":
      return entry.title.length > 14 ? `${entry.title.slice(0, 12)}…` : entry.title;
  }
}

export function formatCalendarDayLabel(
  dayName: string,
  dayEvents: CalendarEvent[]
): string {
  const fw = dayEvents.find(
    (e) => e.type === "academic" && e.academicMeta?.kind === "follows_weekday"
  );
  if (fw?.academicMeta?.followsWeekday) {
    return `${dayName}, follows ${isoWeekdayName(fw.academicMeta.followsWeekday)} timetable`;
  }
  return dayName;
}

export function formatAcademicEventTitle(
  entry: AcademicCalendarEntryItem,
  day: number,
  totalDays: number
): string {
  const rangeSuffix = totalDays > 1 ? `, day ${day} of ${totalDays}` : "";
  switch (entry.kind) {
    case "holiday":
      return `Holiday: ${entry.title}${rangeSuffix}`;
    case "no_classes":
      return `No classes: ${entry.title}${rangeSuffix}`;
    case "break":
      return `Break: ${entry.title}${rangeSuffix}`;
    case "exam_period":
      return `Exam period: ${entry.title}${rangeSuffix}`;
    case "follows_weekday":
      return `Follows ${isoWeekdayName(entry.followsWeekday)} timetable`;
    case "note":
      return `${entry.title}${rangeSuffix}`;
  }
}

/**
 * Expand AcademicCalendarEntryItem rows into all-day CalendarEvent items
 * across every date in [startDateStr, endDateStr] using `entriesForDate`.
 */
export function academicEntriesToCalendarEvents(
  entries: AcademicCalendarEntryItem[],
  startDateStr: string,
  endDateStr: string
): CalendarEvent[] {
  if (entries.length === 0) return [];
  const start = formatDateOnly(startDateStr);
  const end = formatDateOnly(endDateStr);
  const out: CalendarEvent[] = [];

  const cur = new Date(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);

  while (cur.getTime() <= endMs) {
    const dateStr = cur.toISOString().slice(0, 10);
    const dayEntries = entriesForDate(entries, dateStr);
    for (const entry of dayEntries) {
      const { day, totalDays } = getEntryRangeDay(entry, dateStr);
      out.push({
        id: `academic-${entry.id}-${dateStr}`,
        title: formatAcademicEventTitle(entry, day, totalDays),
        date: `${dateStr}T00:00:00.000Z`,
        type: "academic",
        academicMeta: {
          entryId: entry.id,
          semesterId: entry.semesterId,
          semesterName: entry.semesterName,
          kind: entry.kind,
          rawTitle: entry.title,
          startDate: entry.startDate,
          endDate: entry.endDate,
          cancelsClasses: entry.cancelsClasses,
          followsWeekday: entry.followsWeekday,
          notes: entry.notes,
          day,
          totalDays,
          shortLabel: formatAcademicShortLabel(entry),
        },
      });
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  return out;
}
