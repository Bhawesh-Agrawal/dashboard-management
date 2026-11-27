import { describe, expect, it } from "vitest";
import type { AcademicCalendarEntryItem } from "@/features/semesters/lib/academic-calendar-dates";
import { buildTodayAcademicLines } from "../today-academic";

describe("buildTodayAcademicLines", () => {
  it("formats today holiday, follows_weekday, tomorrow exam start, and upcoming countdown", () => {
    const entries: AcademicCalendarEntryItem[] = [
      {
        id: "1",
        semesterId: "s1",
        kind: "holiday",
        title: "Republic Day",
        startDate: "2027-01-26",
        endDate: "2027-01-26",
        cancelsClasses: true,
        followsWeekday: null,
      },
      {
        id: "2",
        semesterId: "s1",
        kind: "exam_period",
        title: "Mid-Semester Examinations",
        startDate: "2027-01-27",
        endDate: "2027-02-03",
        cancelsClasses: true,
        followsWeekday: null,
      },
    ];

    const lines = buildTodayAcademicLines({
      entries,
      todayStr: "2027-01-26",
      tomorrowStr: "2027-01-27",
      upcomingSemester: {
        id: "s2",
        name: "Sem 4",
        startDate: "2027-02-01",
        firstClassDate: "2027-02-01",
      },
    });

    expect(lines).toEqual([
      "Today: holiday, Republic Day. No classes.",
      "Tomorrow: Mid-Semester Examinations begin.",
      "6 days to the first class on 2027-02-01.",
    ]);
  });

  it("formats follows_weekday and returns empty array when nothing to show", () => {
    const fwLines = buildTodayAcademicLines({
      entries: [
        {
          id: "3",
          semesterId: "s1",
          kind: "follows_weekday",
          title: "Saturday follows Monday timetable",
          startDate: "2026-12-19",
          endDate: "2026-12-19",
          cancelsClasses: false,
          followsWeekday: 1,
        },
      ],
      todayStr: "2026-12-19",
      tomorrowStr: "2026-12-20",
    });
    expect(fwLines).toEqual(["Today follows the Monday timetable."]);

    expect(
      buildTodayAcademicLines({
        entries: [],
        todayStr: "2026-12-21",
        tomorrowStr: "2026-12-22",
      })
    ).toEqual([]);
  });
});
