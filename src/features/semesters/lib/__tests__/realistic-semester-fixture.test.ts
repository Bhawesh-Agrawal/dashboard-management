import type { DayOfWeek } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  generateOccurrences,
  type OccurrenceCalendarEntry,
  type OccurrenceSchedule,
} from "@/features/attendance/lib/occurrences";
import { buildBriefPayloadV2 } from "@/features/briefs/lib/sections";

const COURSES = [
  { id: "c1", name: "Algorithms", code: "CS301" },
  { id: "c2", name: "Operating Systems", code: "CS302" },
  { id: "c3", name: "Databases", code: "CS303" },
  { id: "c4", name: "Computer Networks", code: "CS304" },
  { id: "c5", name: "Software Engineering", code: "CS305" },
  { id: "c6", name: "Probability & Stats", code: "MA201" },
];

// 20 weekly slots across 6 courses (MON..FRI, 4 slots/day)
const WEEKLY_SLOTS: Array<{
  id: string;
  courseId: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
}> = [
  { id: "s1", courseId: "c1", dayOfWeek: "MON", startTime: "09:00", endTime: "09:50" },
  { id: "s2", courseId: "c2", dayOfWeek: "MON", startTime: "10:00", endTime: "10:50" },
  { id: "s3", courseId: "c3", dayOfWeek: "MON", startTime: "11:00", endTime: "11:50" },
  { id: "s4", courseId: "c6", dayOfWeek: "MON", startTime: "14:00", endTime: "14:50" },

  { id: "s5", courseId: "c4", dayOfWeek: "TUE", startTime: "09:00", endTime: "09:50" },
  { id: "s6", courseId: "c5", dayOfWeek: "TUE", startTime: "10:00", endTime: "10:50" },
  { id: "s7", courseId: "c1", dayOfWeek: "TUE", startTime: "11:00", endTime: "11:50" },
  { id: "s8", courseId: "c3", dayOfWeek: "TUE", startTime: "14:00", endTime: "14:50" },

  { id: "s9", courseId: "c1", dayOfWeek: "WED", startTime: "09:00", endTime: "09:50" },
  { id: "s10", courseId: "c2", dayOfWeek: "WED", startTime: "10:00", endTime: "10:50" },
  { id: "s11", courseId: "c4", dayOfWeek: "WED", startTime: "11:00", endTime: "11:50" },
  { id: "s12", courseId: "c6", dayOfWeek: "WED", startTime: "14:00", endTime: "14:50" },

  { id: "s13", courseId: "c4", dayOfWeek: "THU", startTime: "09:00", endTime: "09:50" },
  { id: "s14", courseId: "c5", dayOfWeek: "THU", startTime: "10:00", endTime: "10:50" },
  { id: "s15", courseId: "c2", dayOfWeek: "THU", startTime: "11:00", endTime: "11:50" },
  { id: "s16", courseId: "c3", dayOfWeek: "THU", startTime: "14:00", endTime: "14:50" },

  { id: "s17", courseId: "c1", dayOfWeek: "FRI", startTime: "09:00", endTime: "09:50" },
  { id: "s18", courseId: "c5", dayOfWeek: "FRI", startTime: "10:00", endTime: "10:50" },
  { id: "s19", courseId: "c6", dayOfWeek: "FRI", startTime: "11:00", endTime: "11:50" },
  { id: "s20", courseId: "c4", dayOfWeek: "FRI", startTime: "14:00", endTime: "14:50" },
];

const SEMESTER_START = "2026-08-17";
const SEMESTER_END = "2026-12-06";

// 12 holidays, 2-week exam period, 3 follows_weekday days
const CALENDAR_ENTRIES: OccurrenceCalendarEntry[] = [
  { id: "h1", kind: "holiday", title: "Holiday 1", startDate: "2026-08-24", endDate: "2026-08-24", cancelsClasses: true, followsWeekday: null },
  { id: "h2", kind: "holiday", title: "Holiday 2", startDate: "2026-09-07", endDate: "2026-09-07", cancelsClasses: true, followsWeekday: null },
  { id: "h3", kind: "holiday", title: "Holiday 3", startDate: "2026-09-14", endDate: "2026-09-14", cancelsClasses: true, followsWeekday: null },
  { id: "h4", kind: "holiday", title: "Holiday 4", startDate: "2026-09-25", endDate: "2026-09-25", cancelsClasses: true, followsWeekday: null },
  { id: "h5", kind: "holiday", title: "Holiday 5", startDate: "2026-10-02", endDate: "2026-10-02", cancelsClasses: true, followsWeekday: null },
  { id: "h6", kind: "holiday", title: "Holiday 6", startDate: "2026-10-12", endDate: "2026-10-12", cancelsClasses: true, followsWeekday: null },
  { id: "h7", kind: "holiday", title: "Holiday 7", startDate: "2026-10-19", endDate: "2026-10-19", cancelsClasses: true, followsWeekday: null },
  { id: "h8", kind: "holiday", title: "Holiday 8", startDate: "2026-10-30", endDate: "2026-10-30", cancelsClasses: true, followsWeekday: null },
  { id: "h9", kind: "holiday", title: "Holiday 9", startDate: "2026-11-02", endDate: "2026-11-02", cancelsClasses: true, followsWeekday: null },
  { id: "h10", kind: "holiday", title: "Holiday 10", startDate: "2026-11-11", endDate: "2026-11-11", cancelsClasses: true, followsWeekday: null },
  { id: "h11", kind: "holiday", title: "Holiday 11", startDate: "2026-11-16", endDate: "2026-11-16", cancelsClasses: true, followsWeekday: null },
  { id: "h12", kind: "holiday", title: "Holiday 12", startDate: "2026-11-20", endDate: "2026-11-20", cancelsClasses: true, followsWeekday: null },
  // 2-week exam period
  { id: "ex1", kind: "exam_period", title: "Final Exams", startDate: "2026-11-23", endDate: "2026-12-06", cancelsClasses: true, followsWeekday: null },
  // 3 follows_weekday days
  { id: "fw1", kind: "follows_weekday", title: "Monday Timetable", startDate: "2026-09-08", endDate: "2026-09-08", cancelsClasses: false, followsWeekday: 1 },
  { id: "fw2", kind: "follows_weekday", title: "Friday Timetable", startDate: "2026-10-03", endDate: "2026-10-03", cancelsClasses: false, followsWeekday: 5 },
  { id: "fw3", kind: "follows_weekday", title: "Wednesday Timetable", startDate: "2026-11-12", endDate: "2026-11-12", cancelsClasses: false, followsWeekday: 3 },
];

const SCHEDULES: OccurrenceSchedule[] = WEEKLY_SLOTS.map((s) => ({
  id: s.id,
  courseId: s.courseId,
  dayOfWeek: s.dayOfWeek,
  startTime: s.startTime,
  endTime: s.endTime,
  location: "LH-1",
}));

describe("16-week realistic semester fixture", () => {
  it("evaluates holidays, exam period, and follows_weekday swaps across 16 weeks", () => {
    const occs = generateOccurrences({
      schedules: SCHEDULES,
      calendarEntries: CALENDAR_ENTRIES,
      semesterStartDate: SEMESTER_START,
      semesterEndDate: SEMESTER_END,
      now: new Date("2026-12-06T23:59:59.000Z"),
      timezone: "UTC",
    });

    // 1. On Holiday 2 (2026-09-07, Monday), all 4 Monday slots are cancelled with cancelReason "Holiday 2"
    const hol2 = occs.filter((o) => o.date === "2026-09-07");
    expect(hol2).toHaveLength(4);
    expect(hol2.every((o) => o.status === "cancelled" && o.cancelReason === "Holiday 2")).toBe(true);

    // 2. During Final Exams (2026-11-23..2026-12-06), all weekday slots are cancelled
    const examDay = occs.filter((o) => o.date === "2026-11-25");
    expect(examDay).toHaveLength(4);
    expect(examDay.every((o) => o.status === "cancelled" && o.cancelReason === "Final Exams")).toBe(true);

    // 3. On Sat 2026-10-03 (follows_weekday=5 Friday), Friday's 4 slots appear instead of 0 Saturday slots
    const satSwap = occs.filter((o) => o.date === "2026-10-03");
    expect(satSwap).toHaveLength(4);
    expect(satSwap.map((o) => o.classScheduleId).sort()).toEqual(["s17", "s18", "s19", "s20"]);
    expect(satSwap.every((o) => o.status === "unmarked")).toBe(true);

    // 4. On Tue 2026-09-08 (follows_weekday=1 Monday), Monday's slots replace Tuesday's slots
    const tueSwap = occs.filter((o) => o.date === "2026-09-08");
    expect(tueSwap.map((o) => o.classScheduleId).sort()).toEqual(["s1", "s2", "s3", "s4"]);
  });

  it("feeds brief timeline accurately on holiday vs follows_weekday", () => {
    const occs = generateOccurrences({
      schedules: SCHEDULES,
      calendarEntries: CALENDAR_ENTRIES,
      semesterStartDate: SEMESTER_START,
      semesterEndDate: SEMESTER_END,
      now: new Date("2026-12-06T23:59:59.000Z"),
      timezone: "UTC",
    });

    const courseById = new Map(COURSES.map((c) => [c.id, c]));

    const classesForDay = (dateStr: string) =>
      occs
        .filter((o) => o.date === dateStr && o.status !== "cancelled")
        .map((o) => {
          const c = courseById.get(o.courseId)!;
          return {
            id: o.occurrenceId,
            courseId: o.courseId,
            courseName: c.name,
            courseCode: c.code,
            startTime: o.startTime,
            endTime: o.endTime,
            location: o.location ?? null,
            status: o.status,
          };
        });

    const holidayBrief = buildBriefPayloadV2({
      kind: "morning",
      forDate: "2026-09-07",
      nowHm: "07:30",
      generatedAt: "2026-09-07T02:00:00.000Z",
      hasCurrentSemester: true,
      classes: classesForDay("2026-09-07"),
      events: [],
      tasksToday: [],
      overdueTasks: [],
      tasksWithin3Days: [],
      assessmentsWithin7Days: [],
      travel: [],
    });
    expect(holidayBrief.timeline ?? []).toHaveLength(0);

    const swapBrief = buildBriefPayloadV2({
      kind: "morning",
      forDate: "2026-10-03",
      nowHm: "07:30",
      generatedAt: "2026-10-03T02:00:00.000Z",
      hasCurrentSemester: true,
      classes: classesForDay("2026-10-03"),
      events: [],
      tasksToday: [],
      overdueTasks: [],
      tasksWithin3Days: [],
      assessmentsWithin7Days: [],
      travel: [],
    });
    expect(
      (swapBrief.timeline ?? []).filter((i) => i.kind === "class")
    ).toHaveLength(4);
  });
});
