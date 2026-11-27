import { describe, expect, it } from "vitest";
import type { AcademicCalendarEntryItem } from "@/features/semesters/lib/academic-calendar-dates";
import { buildBriefPayloadV2 } from "../sections";

describe("brief academic calendar integration", () => {
  it("includes holiday in timeline and mentions it in summary and headline", () => {
    const entries: AcademicCalendarEntryItem[] = [
      {
        id: "hol-1",
        semesterId: "sem-1",
        kind: "holiday",
        title: "Republic Day",
        startDate: "2027-01-26",
        endDate: "2027-01-26",
        cancelsClasses: true,
        followsWeekday: null,
      },
    ];

    const payload = buildBriefPayloadV2({
      kind: "morning",
      forDate: "2027-01-26",
      nowHm: "07:30",
      generatedAt: "2027-01-26T02:00:00.000Z",
      hasCurrentSemester: true,
      classes: [],
      events: [],
      tasksToday: [],
      overdueTasks: [],
      tasksWithin3Days: [],
      assessmentsWithin7Days: [],
      travel: [],
      academicEntries: entries,
    });

    expect(payload.timeline?.[0]).toMatchObject({
      kind: "academic",
      title: "Holiday: Republic Day",
    });
    expect(payload.headline?.text).toBe("Holiday: Republic Day");
    expect(payload.summary).toContain("Holiday: Republic Day");
  });

  it("includes exam period day X of Y and follows_weekday in timeline and summary", () => {
    const examPayload = buildBriefPayloadV2({
      kind: "morning",
      forDate: "2027-01-30",
      nowHm: "07:30",
      generatedAt: "2027-01-30T02:00:00.000Z",
      hasCurrentSemester: true,
      classes: [],
      events: [],
      tasksToday: [],
      overdueTasks: [],
      tasksWithin3Days: [],
      assessmentsWithin7Days: [],
      travel: [],
      academicEntries: [
        {
          id: "ex-1",
          semesterId: "sem-1",
          kind: "exam_period",
          title: "Mid-Semester Examinations",
          startDate: "2027-01-28",
          endDate: "2027-02-04",
          cancelsClasses: true,
          followsWeekday: null,
        },
      ],
    });

    expect(examPayload.timeline?.[0].title).toBe(
      "Exam period: Mid-Semester Examinations, day 3 of 8"
    );
    expect(examPayload.summary).toContain("Exam period: Mid-Semester Examinations");

    const fwPayload = buildBriefPayloadV2({
      kind: "morning",
      forDate: "2026-12-19",
      nowHm: "07:30",
      generatedAt: "2026-12-19T02:00:00.000Z",
      hasCurrentSemester: true,
      classes: [
        {
          courseId: "course-1",
          courseName: "Algorithms",
          startTime: "09:00",
          endTime: "10:00",
          location: "LH-1",
        },
      ],
      events: [],
      tasksToday: [],
      overdueTasks: [],
      tasksWithin3Days: [],
      assessmentsWithin7Days: [],
      travel: [],
      academicEntries: [
        {
          id: "fw-1",
          semesterId: "sem-1",
          kind: "follows_weekday",
          title: "Saturday follows Monday timetable",
          startDate: "2026-12-19",
          endDate: "2026-12-19",
          cancelsClasses: false,
          followsWeekday: 1,
        },
      ],
    });

    expect(fwPayload.timeline?.[0]).toMatchObject({
      kind: "academic",
      title: "Follows Monday timetable",
    });
    expect(fwPayload.summary).toContain("Follows Monday timetable");
  });
});
