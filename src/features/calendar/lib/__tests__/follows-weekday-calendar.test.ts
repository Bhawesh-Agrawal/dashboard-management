import { describe, expect, it } from "vitest";
import { generateOccurrences } from "@/features/attendance/lib/occurrences";
import {
  academicEntriesToCalendarEvents,
  formatCalendarDayLabel,
} from "../academic-calendar-events";
import type { AcademicCalendarEntryItem } from "@/features/semesters/lib/academic-calendar-dates";

describe("follows_weekday calendar display and timetable classes", () => {
  it("replaces Saturday with Monday timetable classes and formats explicit day label", () => {
    const entries: AcademicCalendarEntryItem[] = [
      {
        id: "fw-sat",
        semesterId: "sem-4",
        kind: "follows_weekday",
        title: "Saturday follows Monday timetable",
        startDate: "2026-12-19",
        endDate: "2026-12-19",
        cancelsClasses: false,
        followsWeekday: 1,
      },
    ];

    const occurrences = generateOccurrences({
      schedules: [
        {
          id: "mon-1",
          courseId: "cs101",
          dayOfWeek: "MON",
          startTime: "09:00",
          endTime: "10:00",
          location: "LH-1",
        },
        {
          id: "sat-1",
          courseId: "cs999",
          dayOfWeek: "SAT",
          startTime: "11:00",
          endTime: "12:00",
          location: "LH-9",
        },
      ],
      calendarEntries: entries,
      semesterStartDate: "2026-12-01",
      semesterEndDate: "2027-04-10",
      startDate: "2026-12-19",
      endDate: "2026-12-19",
      timezone: "UTC",
    });

    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]).toMatchObject({
      classScheduleId: "mon-1",
      courseId: "cs101",
      date: "2026-12-19",
      startTime: "09:00",
      endTime: "10:00",
      substitutedFromDay: "SAT",
    });

    const calEvents = academicEntriesToCalendarEvents(
      entries,
      "2026-12-19",
      "2026-12-19"
    );
    expect(formatCalendarDayLabel("Saturday", calEvents)).toBe(
      "Saturday, follows Monday timetable"
    );
  });
});
