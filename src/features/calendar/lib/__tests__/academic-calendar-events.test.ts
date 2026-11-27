import { describe, expect, it } from "vitest";
import type { AcademicCalendarEntryItem } from "@/features/semesters/lib/academic-calendar-dates";
import { academicEntriesToCalendarEvents } from "../academic-calendar-events";

describe("academicEntriesToCalendarEvents", () => {
  it("expands ranges with day X of Y and formats titles by kind", () => {
    const entries: AcademicCalendarEntryItem[] = [
      {
        id: "e1",
        semesterId: "sem-1",
        semesterName: "Sem 4",
        kind: "exam_period",
        title: "Mid-Semester Examinations",
        startDate: "2027-01-28",
        endDate: "2027-02-04",
        cancelsClasses: true,
        followsWeekday: null,
      },
      {
        id: "e2",
        semesterId: "sem-1",
        kind: "holiday",
        title: "Republic Day",
        startDate: "2027-01-26",
        endDate: "2027-01-26",
        cancelsClasses: true,
        followsWeekday: null,
      },
      {
        id: "e3",
        semesterId: "sem-1",
        kind: "follows_weekday",
        title: "Monday timetable",
        startDate: "2027-01-27",
        endDate: "2027-01-27",
        cancelsClasses: false,
        followsWeekday: 1,
      },
    ];

    const events = academicEntriesToCalendarEvents(entries, "2027-01-26", "2027-01-30");
    expect(events).toHaveLength(5);
    expect(events[0].title).toBe("Holiday: Republic Day");
    expect(events[0].academicMeta?.shortLabel).toBe("Holiday");
    expect(events[1].title).toBe("Follows Monday timetable");
    expect(events[1].academicMeta?.shortLabel).toBe("Follows Mon");
    expect(events[4].title).toBe("Exam period: Mid-Semester Examinations, day 3 of 8");
    expect(events[4].academicMeta).toMatchObject({
      day: 3,
      totalDays: 8,
      shortLabel: "Exams",
      cancelsClasses: true,
    });
  });
});
