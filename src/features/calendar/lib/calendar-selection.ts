import type { CalendarEvent } from "@/types";
import { addDays, toDateStr } from "./date-utils";

export function getEventsForDay(
  eventsByDate: Record<string, CalendarEvent[]>,
  dateStr: string
): CalendarEvent[] {
  return eventsByDate[dateStr] ?? [];
}

export function getEventsForWeek(
  eventsByDate: Record<string, CalendarEvent[]>,
  weekStart: Date
): Array<{ dateStr: string; date: Date; events: CalendarEvent[] }> {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const dateStr = toDateStr(date);
    return {
      dateStr,
      date,
      events: getEventsForDay(eventsByDate, dateStr),
    };
  });
}

export function groupDayEvents(events: CalendarEvent[]): {
  allDay: CalendarEvent[];
  timed: CalendarEvent[];
} {
  const allDay = events.filter((e) => !e.time);
  // Keep academic entries first among all-day items
  allDay.sort((a, b) => {
    if (a.type === "academic" && b.type !== "academic") return -1;
    if (a.type !== "academic" && b.type === "academic") return 1;
    return 0;
  });
  const timed = events
    .filter((e) => Boolean(e.time))
    .sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
  return { allDay, timed };
}
