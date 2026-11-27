import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "@/types";
import { generateOccurrences } from "@/features/attendance/lib/occurrences";
import { academicEntriesToCalendarEvents } from "../academic-calendar-events";
import type { AcademicCalendarEntryItem } from "@/features/semesters/lib/academic-calendar-dates";
import {
  getEventsForDay,
  getEventsForWeek,
  groupDayEvents,
} from "../calendar-selection";

describe("calendar data selection (day, week, holiday, follows-weekday)", () => {
  it("selects day & week events including holiday and follows_weekday occurrences", () => {
    const entries: AcademicCalendarEntryItem[] = [
      {
        id: "hol-1",
        semesterId: "sem-4",
        kind: "holiday",
        title: "Christmas",
        startDate: "2026-12-25",
        endDate: "2026-12-25",
        cancelsClasses: true,
        followsWeekday: null,
      },
      {
        id: "fw-1",
        semesterId: "sem-4",
        kind: "follows_weekday",
        title: "Saturday follows Monday timetable",
        startDate: "2026-12-26",
        endDate: "2026-12-26",
        cancelsClasses: false,
        followsWeekday: 1,
      },
    ];

    const schedules = [
      {
        id: "mon-cs101",
        courseId: "cs101",
        dayOfWeek: "MON" as const,
        startTime: "09:00",
        endTime: "10:00",
        location: "LH-1",
      },
      {
        id: "fri-cs102",
        courseId: "cs102",
        dayOfWeek: "FRI" as const,
        startTime: "10:00",
        endTime: "11:00",
        location: "LH-2",
      },
    ];

    const occs = generateOccurrences({
      schedules,
      calendarEntries: entries,
      semesterStartDate: "2026-12-01",
      semesterEndDate: "2027-04-10",
      startDate: "2026-12-20",
      endDate: "2026-12-26",
      timezone: "UTC",
    });

    const academicEvents = academicEntriesToCalendarEvents(
      entries,
      "2026-12-20",
      "2026-12-26"
    );

    const classEvents: CalendarEvent[] = occs
      .filter((o) => o.status !== "cancelled")
      .map((o) => ({
        id: o.occurrenceId,
        title: o.courseId,
        date: `${o.date}T00:00:00.000Z`,
        time: o.startTime,
        endTime: o.endTime,
        type: "class",
        courseId: o.courseId,
        location: o.location ?? undefined,
      }));

    const eventsByDate: Record<string, CalendarEvent[]> = {};
    for (const ev of [...academicEvents, ...classEvents]) {
      const k = ev.date.slice(0, 10);
      eventsByDate[k] = [...(eventsByDate[k] ?? []), ev];
    }

    // Holiday day (2026-12-25): Friday class cancelled, only Holiday all-day item present
    const holidayGrouped = groupDayEvents(getEventsForDay(eventsByDate, "2026-12-25"));
    expect(holidayGrouped.allDay.map((e) => e.title)).toEqual(["Holiday: Christmas"]);
    expect(holidayGrouped.timed).toHaveLength(0);

    // Follows-weekday day (2026-12-26, Saturday follows Monday): Monday's class + all-day label
    const fwGrouped = groupDayEvents(getEventsForDay(eventsByDate, "2026-12-26"));
    expect(fwGrouped.allDay.map((e) => e.title)).toEqual(["Follows Monday timetable"]);
    expect(fwGrouped.timed).toHaveLength(1);
    expect(fwGrouped.timed[0].courseId).toBe("cs101");

    // Week selection (Sun 2026-12-20 .. Sat 2026-12-26)
    const week = getEventsForWeek(eventsByDate, new Date(2026, 11, 20));
    expect(week).toHaveLength(7);
    expect(week[1].events).toHaveLength(1); // Mon 2026-12-21
    expect(week[5].events.map((e) => e.title)).toEqual(["Holiday: Christmas"]);
    expect(week[6].events).toHaveLength(2); // Sat 2026-12-26 (follows Monday + cs101)
  });
});
