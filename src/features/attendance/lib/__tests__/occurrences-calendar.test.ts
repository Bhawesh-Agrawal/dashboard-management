import { describe, expect, it } from "vitest";
import { generateOccurrences, type OccurrenceCalendarEntry, type OccurrenceSchedule } from "../occurrences";
import { computeAttendanceMetrics } from "../calculations";

const SCHED_MON: OccurrenceSchedule = {
  id: "s-mon",
  courseId: "c-1",
  dayOfWeek: "MON",
  startTime: "09:00",
  endTime: "10:00",
  location: "LH-1",
};

const SCHED_TUE: OccurrenceSchedule = {
  id: "s-tue",
  courseId: "c-1",
  dayOfWeek: "TUE",
  startTime: "11:00",
  endTime: "12:00",
  location: "LH-2",
};

const SCHED_SAT_NONE: OccurrenceSchedule[] = [SCHED_MON, SCHED_TUE];

describe("occurrences engine with AcademicCalendarEntry (Phase 7 Item 3)", () => {
  const baseOpts = {
    schedules: SCHED_SAT_NONE,
    semesterId: "sem-1",
    semesterStartDate: "2027-01-04", // Mon
    semesterEndDate: "2027-01-31",
    timezone: "Asia/Kathmandu",
    now: new Date("2027-01-20T12:00:00.000Z"),
  };

  it("1. cancels a single holiday and sets cancelReason", () => {
    const occs = generateOccurrences({
      ...baseOpts,
      startDate: "2027-01-04",
      endDate: "2027-01-05",
      calendarEntries: [
        {
          id: "h1",
          kind: "holiday",
          title: "Founders Day",
          startDate: "2027-01-04",
          endDate: "2027-01-04",
          cancelsClasses: true,
        },
      ],
    });
    expect(occs).toHaveLength(2);
    expect(occs[0].status).toBe("cancelled");
    expect(occs[0].cancelReason).toBe("Founders Day");
    expect(occs[0].calendarEntryId).toBe("h1");
    expect(occs[1].status).toBe("unmarked");
  });

  it("2. cancels multi-day break range inclusively", () => {
    const occs = generateOccurrences({
      ...baseOpts,
      startDate: "2027-01-11",
      endDate: "2027-01-19",
      calendarEntries: [
        {
          id: "b1",
          kind: "break",
          title: "Winter Break",
          startDate: "2027-01-11",
          endDate: "2027-01-12",
          cancelsClasses: true,
        },
      ],
    });
    expect(occs.filter((o) => o.date <= "2027-01-12").every((o) => o.status === "cancelled")).toBe(true);
    expect(occs.filter((o) => o.date >= "2027-01-18").every((o) => o.status === "unmarked")).toBe(true);
  });

  it("3. cancels classes during exam_period when cancelsClasses is true", () => {
    const occs = generateOccurrences({
      ...baseOpts,
      startDate: "2027-01-18",
      endDate: "2027-01-19",
      calendarEntries: [
        {
          id: "ex1",
          kind: "exam_period",
          title: "Mid-Sem Exams",
          startDate: "2027-01-18",
          endDate: "2027-01-22",
          cancelsClasses: true,
        },
      ],
    });
    expect(occs.every((o) => o.status === "cancelled" && o.cancelReason === "Mid-Sem Exams")).toBe(true);
  });

  it("4. does not cancel classes for exam_period if cancelsClasses is false", () => {
    const occs = generateOccurrences({
      ...baseOpts,
      startDate: "2027-01-18",
      endDate: "2027-01-18",
      calendarEntries: [
        {
          id: "ex2",
          kind: "exam_period",
          title: "Lab Evaluations",
          startDate: "2027-01-18",
          endDate: "2027-01-18",
          cancelsClasses: false,
        },
      ],
    });
    expect(occs[0].status).toBe("unmarked");
  });

  it("5. does not cancel classes for note entries", () => {
    const occs = generateOccurrences({
      ...baseOpts,
      startDate: "2027-01-04",
      endDate: "2027-01-04",
      calendarEntries: [
        {
          id: "n1",
          kind: "note",
          title: "Orientation",
          startDate: "2027-01-04",
          endDate: "2027-01-04",
          cancelsClasses: false,
        },
      ],
    });
    expect(occs[0].status).toBe("unmarked");
  });

  it("6. no_classes cancels all classes on that day", () => {
    const occs = generateOccurrences({
      ...baseOpts,
      startDate: "2027-01-05",
      endDate: "2027-01-05",
      calendarEntries: [
        {
          id: "nc1",
          kind: "no_classes",
          title: "Convocation",
          startDate: "2027-01-05",
          endDate: "2027-01-05",
          cancelsClasses: true,
        },
      ],
    });
    expect(occs[0].status).toBe("cancelled");
    expect(occs[0].cancelReason).toBe("Convocation");
  });

  it("7. resolves overlapping entries deterministically (cancelsClasses wins over note, sorted by start/title)", () => {
    const entries: OccurrenceCalendarEntry[] = [
      { id: "n1", kind: "note", title: "Note", startDate: "2027-01-04", endDate: "2027-01-04", cancelsClasses: false },
      { id: "h2", kind: "holiday", title: "Zeta Holiday", startDate: "2027-01-04", endDate: "2027-01-04", cancelsClasses: true },
      { id: "h1", kind: "holiday", title: "Alpha Holiday", startDate: "2027-01-04", endDate: "2027-01-04", cancelsClasses: true },
    ];
    const occsA = generateOccurrences({ ...baseOpts, startDate: "2027-01-04", endDate: "2027-01-04", calendarEntries: entries });
    const occsB = generateOccurrences({ ...baseOpts, startDate: "2027-01-04", endDate: "2027-01-04", calendarEntries: [...entries].reverse() });
    expect(occsA[0].cancelReason).toBe("Alpha Holiday");
    expect(occsB[0].cancelReason).toBe("Alpha Holiday");
  });

  it("8. follows_weekday replaces Saturday with Monday schedules", () => {
    const occs = generateOccurrences({
      ...baseOpts,
      startDate: "2027-01-09", // Saturday
      endDate: "2027-01-09",
      calendarEntries: [
        {
          id: "fw1",
          kind: "follows_weekday",
          title: "Sat follows Mon",
          startDate: "2027-01-09",
          endDate: "2027-01-09",
          cancelsClasses: false,
          followsWeekday: 1,
        },
      ],
    });
    expect(occs).toHaveLength(1);
    expect(occs[0].classScheduleId).toBe("s-mon");
    expect(occs[0].dayOfWeek).toBe("MON");
    expect(occs[0].substitutedFromDay).toBe("SAT");
    expect(occs[0].startTime).toBe("09:00");
  });

  it("9. follows_weekday on a weekday with own classes suppresses native weekday's classes", () => {
    const occs = generateOccurrences({
      ...baseOpts,
      startDate: "2027-01-05", // Tuesday
      endDate: "2027-01-05",
      calendarEntries: [
        {
          id: "fw2",
          kind: "follows_weekday",
          title: "Tue follows Mon",
          startDate: "2027-01-05",
          endDate: "2027-01-05",
          cancelsClasses: false,
          followsWeekday: 1,
        },
      ],
    });
    expect(occs).toHaveLength(1);
    expect(occs[0].classScheduleId).toBe("s-mon");
  });

  it("10. follows_weekday to a target weekday with no schedules produces 0 occurrences", () => {
    const occs = generateOccurrences({
      ...baseOpts,
      startDate: "2027-01-04", // Monday
      endDate: "2027-01-04",
      calendarEntries: [
        {
          id: "fw3",
          kind: "follows_weekday",
          title: "Mon follows Fri",
          startDate: "2027-01-04",
          endDate: "2027-01-04",
          cancelsClasses: false,
          followsWeekday: 5, // Friday has no classes
        },
      ],
    });
    expect(occs).toHaveLength(0);
  });

  it("11. holiday on a follows_weekday date cancels classes (holiday wins)", () => {
    const occs = generateOccurrences({
      ...baseOpts,
      startDate: "2027-01-09", // Saturday
      endDate: "2027-01-09",
      calendarEntries: [
        {
          id: "fw4",
          kind: "follows_weekday",
          title: "Sat follows Mon",
          startDate: "2027-01-09",
          endDate: "2027-01-09",
          cancelsClasses: false,
          followsWeekday: 1,
        },
        {
          id: "h-sat",
          kind: "holiday",
          title: "Emergency Holiday",
          startDate: "2027-01-09",
          endDate: "2027-01-09",
          cancelsClasses: true,
        },
      ],
    });
    // Native Saturday has 0 classes, or if Saturday had classes they'd be cancelled
    expect(occs.every((o) => o.status === "cancelled")).toBe(true);
  });

  it("12. holiday on a follows_weekday date where native day has classes cancels native classes", () => {
    const occs = generateOccurrences({
      ...baseOpts,
      startDate: "2027-01-05", // Tuesday (has s-tue)
      endDate: "2027-01-05",
      calendarEntries: [
        {
          id: "fw5",
          kind: "follows_weekday",
          title: "Tue follows Mon",
          startDate: "2027-01-05",
          endDate: "2027-01-05",
          cancelsClasses: false,
          followsWeekday: 1,
        },
        {
          id: "h-tue",
          kind: "holiday",
          title: "National Holiday",
          startDate: "2027-01-05",
          endDate: "2027-01-05",
          cancelsClasses: true,
        },
      ],
    });
    expect(occs).toHaveLength(1);
    expect(occs[0].classScheduleId).toBe("s-tue");
    expect(occs[0].status).toBe("cancelled");
    expect(occs[0].cancelReason).toBe("National Holiday");
  });

  it("13. attendance record attaches to the replacing schedule on follows_weekday", () => {
    const occs = generateOccurrences({
      ...baseOpts,
      startDate: "2027-01-09",
      endDate: "2027-01-09",
      records: [
        { id: "r1", courseId: "c-1", classScheduleId: "s-mon", date: "2027-01-09", status: "present" },
      ],
      calendarEntries: [
        {
          id: "fw6",
          kind: "follows_weekday",
          title: "Sat follows Mon",
          startDate: "2027-01-09",
          endDate: "2027-01-09",
          cancelsClasses: false,
          followsWeekday: 1,
        },
      ],
    });
    expect(occs[0].status).toBe("present");
    expect(occs[0].attendanceRecordId).toBe("r1");
  });

  it("14. class-level ScheduleException cancelled wins even with present record", () => {
    const occs = generateOccurrences({
      ...baseOpts,
      startDate: "2027-01-04",
      endDate: "2027-01-04",
      exceptions: [{ id: "ex1", classScheduleId: "s-mon", date: "2027-01-04", type: "cancelled" }],
      records: [{ id: "r1", courseId: "c-1", classScheduleId: "s-mon", date: "2027-01-04", status: "present" }],
    });
    expect(occs[0].status).toBe("cancelled");
  });

  it("15. class-level ScheduleException rescheduled applies on follows_weekday date", () => {
    const occs = generateOccurrences({
      ...baseOpts,
      startDate: "2027-01-09",
      endDate: "2027-01-09",
      exceptions: [
        {
          id: "ex2",
          classScheduleId: "s-mon",
          date: "2027-01-09",
          type: "rescheduled",
          newStartTime: "10:30",
          newEndTime: "11:30",
        },
      ],
      calendarEntries: [
        {
          id: "fw7",
          kind: "follows_weekday",
          title: "Sat follows Mon",
          startDate: "2027-01-09",
          endDate: "2027-01-09",
          cancelsClasses: false,
          followsWeekday: 1,
        },
      ],
    });
    expect(occs[0].startTime).toBe("10:30");
    expect(occs[0].isException).toBe(true);
  });

  it("16. class-level rescheduled is still cancelled by a semester holiday", () => {
    const occs = generateOccurrences({
      ...baseOpts,
      startDate: "2027-01-04",
      endDate: "2027-01-04",
      exceptions: [
        { id: "ex3", classScheduleId: "s-mon", date: "2027-01-04", type: "rescheduled", newStartTime: "14:00" },
      ],
      calendarEntries: [
        { id: "h3", kind: "holiday", title: "Holiday", startDate: "2027-01-04", endDate: "2027-01-04", cancelsClasses: true },
      ],
    });
    expect(occs[0].status).toBe("cancelled");
    expect(occs[0].cancelReason).toBe("Holiday");
  });

  it("17. ignores entries outside semester range", () => {
    const occs = generateOccurrences({
      ...baseOpts,
      startDate: "2027-01-01",
      endDate: "2027-02-05",
      calendarEntries: [
        { id: "h-out", kind: "holiday", title: "Pre-sem", startDate: "2027-01-01", endDate: "2027-01-03", cancelsClasses: true },
      ],
    });
    expect(occs.every((o) => o.date >= "2027-01-04" && o.date <= "2027-01-31")).toBe(true);
    expect(occs.some((o) => o.cancelReason === "Pre-sem")).toBe(false);
  });

  it("18. ignores entries belonging to a different semesterId", () => {
    const occs = generateOccurrences({
      ...baseOpts,
      startDate: "2027-01-04",
      endDate: "2027-01-04",
      calendarEntries: [
        {
          id: "h-other",
          semesterId: "sem-2",
          kind: "holiday",
          title: "Other Sem Holiday",
          startDate: "2027-01-04",
          endDate: "2027-01-04",
          cancelsClasses: true,
        },
      ],
    });
    expect(occs[0].status).toBe("unmarked");
  });

  it("19. handles timezone date boundaries in Asia/Kathmandu vs UTC", () => {
    // 2027-01-04T20:00:00Z is 2027-01-05 01:45 in Asia/Kathmandu (+05:45)
    const occs = generateOccurrences({
      ...baseOpts,
      startDate: "2027-01-04",
      endDate: "2027-01-05",
      now: new Date("2027-01-04T20:00:00.000Z"),
      timezone: "Asia/Kathmandu",
    });
    const jan4 = occs.find((o) => o.date === "2027-01-04")!;
    const jan5 = occs.find((o) => o.date === "2027-01-05")!;
    expect(jan4.isPast).toBe(true);
    expect(jan5.isToday).toBe(true);
  });

  it("20. excludes calendar-cancelled occurrences from attendance percentages", () => {
    const occs = generateOccurrences({
      ...baseOpts,
      startDate: "2027-01-04",
      endDate: "2027-01-12",
      records: [
        { id: "r1", courseId: "c-1", classScheduleId: "s-mon", date: "2027-01-04", status: "present" },
      ],
      calendarEntries: [
        { id: "h1", kind: "holiday", title: "Holiday", startDate: "2027-01-05", endDate: "2027-01-05", cancelsClasses: true },
      ],
    });
    const window = occs.filter((o) => o.date <= "2027-01-05");
    const metrics = computeAttendanceMetrics({
      present: window.filter((o) => o.status === "present").length,
      absent: window.filter((o) => o.status === "absent").length,
      cancelled: window.filter((o) => o.status === "cancelled").length,
      targetPercent: 75,
    });
    expect(metrics.present).toBe(1);
    expect(metrics.cancelled).toBe(1);
    expect(metrics.totalCounted).toBe(1);
    expect(metrics.percent).toBe(100);
  });

  it("21. handles Sunday (7) follows_weekday substitution", () => {
    const schedSun: OccurrenceSchedule = { id: "s-sun", courseId: "c-1", dayOfWeek: "SUN", startTime: "10:00", endTime: "11:00" };
    const occs = generateOccurrences({
      ...baseOpts,
      schedules: [schedSun],
      startDate: "2027-01-04", // Mon
      endDate: "2027-01-04",
      calendarEntries: [
        { id: "fw-sun", kind: "follows_weekday", title: "Mon follows Sun", startDate: "2027-01-04", endDate: "2027-01-04", cancelsClasses: false, followsWeekday: 7 },
      ],
    });
    expect(occs).toHaveLength(1);
    expect(occs[0].dayOfWeek).toBe("SUN");
  });

  it("22. handles all 7 ISO weekdays 1..7", () => {
    const days: Array<[number, string]> = [
      [1, "MON"], [2, "TUE"], [3, "WED"], [4, "THU"], [5, "FRI"], [6, "SAT"], [7, "SUN"],
    ];
    for (const [iso, expected] of days) {
      const sched: OccurrenceSchedule = {
        id: `s-${expected}`,
        courseId: "c-1",
        dayOfWeek: expected as OccurrenceSchedule["dayOfWeek"],
        startTime: "09:00",
        endTime: "10:00",
      };
      const occs = generateOccurrences({
        ...baseOpts,
        schedules: [sched],
        startDate: "2027-01-04",
        endDate: "2027-01-04",
        calendarEntries: [
          { id: `fw-${iso}`, kind: "follows_weekday", title: `Follows ${expected}`, startDate: "2027-01-04", endDate: "2027-01-04", cancelsClasses: false, followsWeekday: iso },
        ],
      });
      expect(occs).toHaveLength(1);
      expect(occs[0].dayOfWeek).toBe(expected);
    }
  });

  it("23. ignores malformed calendar entry with startDate > endDate", () => {
    const occs = generateOccurrences({
      ...baseOpts,
      startDate: "2027-01-04",
      endDate: "2027-01-04",
      calendarEntries: [
        { id: "bad", kind: "holiday", title: "Bad", startDate: "2027-01-10", endDate: "2027-01-02", cancelsClasses: true },
      ],
    });
    expect(occs[0].status).toBe("unmarked");
  });

  it("24. respects schedule effectiveStartDate and effectiveEndDate on follows_weekday", () => {
    const occs = generateOccurrences({
      ...baseOpts,
      schedules: [{ ...SCHED_MON, effectiveStartDate: "2027-01-15" }],
      startDate: "2027-01-09",
      endDate: "2027-01-09",
      calendarEntries: [
        { id: "fw", kind: "follows_weekday", title: "Sat follows Mon", startDate: "2027-01-09", endDate: "2027-01-09", cancelsClasses: false, followsWeekday: 1 },
      ],
    });
    expect(occs).toHaveLength(0);
  });

  it("25. handles partial overlap of multi-day break with semester start", () => {
    const occs = generateOccurrences({
      ...baseOpts,
      startDate: "2027-01-04",
      endDate: "2027-01-05",
      calendarEntries: [
        { id: "b-part", kind: "break", title: "Extended Break", startDate: "2027-01-01", endDate: "2027-01-04", cancelsClasses: true },
      ],
    });
    expect(occs[0].status).toBe("cancelled");
    expect(occs[1].status).toBe("unmarked");
  });

  it("26. preserves legacy record matching on follows_weekday when single schedule runs", () => {
    const occs = generateOccurrences({
      ...baseOpts,
      startDate: "2027-01-09",
      endDate: "2027-01-09",
      records: [{ id: "leg-1", courseId: "c-1", classScheduleId: null, date: "2027-01-09", status: "absent" }],
      calendarEntries: [
        { id: "fw-leg", kind: "follows_weekday", title: "Sat follows Mon", startDate: "2027-01-09", endDate: "2027-01-09", cancelsClasses: false, followsWeekday: 1 },
      ],
    });
    expect(occs[0].status).toBe("absent");
  });

  it("27. does not apply legacy record status when date is cancelled by holiday", () => {
    const occs = generateOccurrences({
      ...baseOpts,
      startDate: "2027-01-04",
      endDate: "2027-01-04",
      records: [{ id: "leg-2", courseId: "c-1", classScheduleId: null, date: "2027-01-04", status: "present" }],
      calendarEntries: [
        { id: "h-leg", kind: "holiday", title: "Holiday", startDate: "2027-01-04", endDate: "2027-01-04", cancelsClasses: true },
      ],
    });
    expect(occs[0].status).toBe("cancelled");
  });

  it("28. returns empty occurrences when schedules array is empty", () => {
    const occs = generateOccurrences({
      ...baseOpts,
      schedules: [],
      calendarEntries: [
        { id: "h-empty", kind: "holiday", title: "Holiday", startDate: "2027-01-04", endDate: "2027-01-04", cancelsClasses: true },
      ],
    });
    expect(occs).toEqual([]);
  });

  it("29. handles multiple schedules on same substituted weekday sorted by startTime", () => {
    const occs = generateOccurrences({
      ...baseOpts,
      schedules: [
        { id: "s-mon-pm", courseId: "c-1", dayOfWeek: "MON", startTime: "14:00", endTime: "15:00" },
        SCHED_MON,
      ],
      startDate: "2027-01-09",
      endDate: "2027-01-09",
      calendarEntries: [
        { id: "fw-sort", kind: "follows_weekday", title: "Sat follows Mon", startDate: "2027-01-09", endDate: "2027-01-09", cancelsClasses: false, followsWeekday: 1 },
      ],
    });
    expect(occs.map((o) => o.startTime)).toEqual(["09:00", "14:00"]);
  });

  it("30. handles Date objects for calendarEntry startDate and endDate", () => {
    const occs = generateOccurrences({
      ...baseOpts,
      startDate: "2027-01-04",
      endDate: "2027-01-04",
      calendarEntries: [
        {
          id: "h-date",
          kind: "holiday",
          title: "Date Obj Holiday",
          startDate: new Date("2027-01-04T00:00:00.000Z"),
          endDate: new Date("2027-01-04T00:00:00.000Z"),
          cancelsClasses: true,
        },
      ],
    });
    expect(occs[0].status).toBe("cancelled");
    expect(occs[0].cancelReason).toBe("Date Obj Holiday");
  });
});
