import { describe, it, expect } from "vitest";
import { generateOccurrences, OccurrenceSchedule, OccurrenceException, OccurrenceRecord } from "../occurrences";

describe("Occurrence Engine (generateOccurrences)", () => {
  const baseSchedules: OccurrenceSchedule[] = [
    {
      id: "sched-mon",
      courseId: "course-cs101",
      dayOfWeek: "MON",
      startTime: "09:00",
      endTime: "10:30",
      location: "Room 101",
    },
    {
      id: "sched-wed",
      courseId: "course-cs101",
      dayOfWeek: "WED",
      startTime: "11:00",
      endTime: "12:30",
      location: "Room 102",
    },
  ];

  // Simulated "now": Wednesday 2026-11-18 at 11:30 in Asia/Kolkata (06:00 UTC)
  const simulatedNow = new Date("2026-11-18T06:00:00.000Z");

  // 1. Weekly recurrence
  it("weekly recurrence: generates recurring occurrences on the correct day of week across multiple weeks", () => {
    const occurrences = generateOccurrences({
      schedules: baseSchedules,
      startDate: "2026-11-02", // Mon
      endDate: "2026-11-22",   // 3 full weeks
      now: simulatedNow,
      timezone: "Asia/Kolkata",
    });

    // 3 Mondays + 3 Wednesdays = 6 occurrences
    expect(occurrences).toHaveLength(6);
    expect(occurrences.map((o) => `${o.date} ${o.dayOfWeek}`)).toEqual([
      "2026-11-02 MON",
      "2026-11-04 WED",
      "2026-11-09 MON",
      "2026-11-11 WED",
      "2026-11-16 MON",
      "2026-11-18 WED",
    ]);
  });

  // 2. Sorting
  it("weekly recurrence: maintains chronological sorting across weeks by date and startTime", () => {
    const occurrences = generateOccurrences({
      schedules: baseSchedules,
      startDate: "2026-11-02",
      endDate: "2026-11-11",
      now: simulatedNow,
      timezone: "Asia/Kolkata",
    });

    for (let i = 1; i < occurrences.length; i++) {
      const prev = occurrences[i - 1];
      const curr = occurrences[i];
      if (prev.date === curr.date) {
        expect(prev.startTime.localeCompare(curr.startTime)).toBeLessThanOrEqual(0);
      } else {
        expect(prev.date.localeCompare(curr.date)).toBeLessThan(0);
      }
    }
  });

  // 3. Two schedules same day
  it("two schedules same day: generates two distinct occurrences when a course has morning lecture and afternoon lab on the same day", () => {
    const sameDaySchedules: OccurrenceSchedule[] = [
      {
        id: "sched-wed-morning",
        courseId: "course-cs101",
        dayOfWeek: "WED",
        startTime: "09:00",
        endTime: "10:30",
        location: "Hall A",
      },
      {
        id: "sched-wed-afternoon",
        courseId: "course-cs101",
        dayOfWeek: "WED",
        startTime: "14:00",
        endTime: "16:00",
        location: "Lab B",
      },
    ];

    const occurrences = generateOccurrences({
      schedules: sameDaySchedules,
      startDate: "2026-11-18",
      endDate: "2026-11-18",
      now: simulatedNow,
      timezone: "Asia/Kolkata",
    });

    expect(occurrences).toHaveLength(2);
    expect(occurrences[0].classScheduleId).toBe("sched-wed-morning");
    expect(occurrences[0].startTime).toBe("09:00");
    expect(occurrences[1].classScheduleId).toBe("sched-wed-afternoon");
    expect(occurrences[1].startTime).toBe("14:00");
  });

  // 4. Same day independent keys
  it("two schedules same day: preserves independent classScheduleIds and start times for same-day occurrences", () => {
    const multiSchedules: OccurrenceSchedule[] = [
      {
        id: "sched-1",
        courseId: "c1",
        dayOfWeek: "MON",
        startTime: "10:00",
        endTime: "11:00",
      },
      {
        id: "sched-2",
        courseId: "c1",
        dayOfWeek: "MON",
        startTime: "12:00",
        endTime: "13:00",
      },
    ];

    const occurrences = generateOccurrences({
      schedules: multiSchedules,
      startDate: "2026-11-09",
      endDate: "2026-11-09",
      now: simulatedNow,
      timezone: "Asia/Kolkata",
    });

    expect(occurrences[0].occurrenceId).toBe("sched-1_2026-11-09");
    expect(occurrences[1].occurrenceId).toBe("sched-2_2026-11-09");
    expect(occurrences[0].occurrenceId).not.toBe(occurrences[1].occurrenceId);
  });

  // 5. Effective start date edge - excluded before
  it("effectiveStartDate edge: excludes occurrences strictly before effectiveStartDate", () => {
    const schedules: OccurrenceSchedule[] = [
      {
        id: "sched-eff-start",
        courseId: "course-1",
        dayOfWeek: "MON",
        startTime: "09:00",
        endTime: "10:00",
        effectiveStartDate: "2026-11-10", // Tuesday: so Nov 9 is excluded
      },
    ];

    const occurrences = generateOccurrences({
      schedules,
      startDate: "2026-11-02",
      endDate: "2026-11-16",
      now: simulatedNow,
      timezone: "Asia/Kolkata",
    });

    // Nov 2 & Nov 9 are excluded; only Nov 16 should exist
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].date).toBe("2026-11-16");
  });

  // 6. Effective start date edge - included on exact day
  it("effectiveStartDate edge: includes occurrence on the exact day of effectiveStartDate", () => {
    const schedules: OccurrenceSchedule[] = [
      {
        id: "sched-eff-start-exact",
        courseId: "course-1",
        dayOfWeek: "MON",
        startTime: "09:00",
        endTime: "10:00",
        effectiveStartDate: "2026-11-09", // exact Monday
      },
    ];

    const occurrences = generateOccurrences({
      schedules,
      startDate: "2026-11-02",
      endDate: "2026-11-09",
      now: simulatedNow,
      timezone: "Asia/Kolkata",
    });

    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].date).toBe("2026-11-09");
  });

  // 7. Effective end date edge - included on exact day
  it("effectiveEndDate edge: includes occurrence on the exact day of effectiveEndDate", () => {
    const schedules: OccurrenceSchedule[] = [
      {
        id: "sched-eff-end-exact",
        courseId: "course-1",
        dayOfWeek: "MON",
        startTime: "09:00",
        endTime: "10:00",
        effectiveEndDate: "2026-11-09", // exact Monday
      },
    ];

    const occurrences = generateOccurrences({
      schedules,
      startDate: "2026-11-09",
      endDate: "2026-11-16",
      now: simulatedNow,
      timezone: "Asia/Kolkata",
    });

    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].date).toBe("2026-11-09");
  });

  // 8. Effective end date edge - excluded after
  it("effectiveEndDate edge: excludes occurrences strictly after effectiveEndDate", () => {
    const schedules: OccurrenceSchedule[] = [
      {
        id: "sched-eff-end",
        courseId: "course-1",
        dayOfWeek: "MON",
        startTime: "09:00",
        endTime: "10:00",
        effectiveEndDate: "2026-11-08", // Sunday: Nov 9 is after
      },
    ];

    const occurrences = generateOccurrences({
      schedules,
      startDate: "2026-11-02",
      endDate: "2026-11-16",
      now: simulatedNow,
      timezone: "Asia/Kolkata",
    });

    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].date).toBe("2026-11-02");
  });

  // 9. Effective date window
  it("effective date window: generates occurrences only within effectiveStartDate and effectiveEndDate window", () => {
    const schedules: OccurrenceSchedule[] = [
      {
        id: "sched-window",
        courseId: "course-1",
        dayOfWeek: "WED",
        startTime: "10:00",
        endTime: "11:00",
        effectiveStartDate: "2026-11-05",
        effectiveEndDate: "2026-11-15",
      },
    ];

    const occurrences = generateOccurrences({
      schedules,
      startDate: "2026-11-01",
      endDate: "2026-11-30",
      now: simulatedNow,
      timezone: "Asia/Kolkata",
    });

    // Only Nov 11 is a Wednesday within Nov 5 - Nov 15
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].date).toBe("2026-11-11");
  });

  // 10. Semester first day
  it("semester bounds: includes occurrence on the exact first day of the semester", () => {
    const occurrences = generateOccurrences({
      schedules: [
        {
          id: "sched-first",
          courseId: "c1",
          dayOfWeek: "MON",
          startTime: "09:00",
          endTime: "10:00",
        },
      ],
      semesterStartDate: "2026-11-02", // Monday
      semesterEndDate: "2026-11-30",
      now: simulatedNow,
      timezone: "Asia/Kolkata",
    });

    expect(occurrences[0].date).toBe("2026-11-02");
  });

  // 11. Semester last day
  it("semester bounds: includes occurrence on the exact last day of the semester", () => {
    const occurrences = generateOccurrences({
      schedules: [
        {
          id: "sched-last",
          courseId: "c1",
          dayOfWeek: "MON",
          startTime: "09:00",
          endTime: "10:00",
        },
      ],
      semesterStartDate: "2026-11-02",
      semesterEndDate: "2026-11-30", // Monday
      now: simulatedNow,
      timezone: "Asia/Kolkata",
    });

    expect(occurrences[occurrences.length - 1].date).toBe("2026-11-30");
  });

  // 12. Semester bounds exclusion
  it("semester bounds: excludes dates outside semester start and end dates", () => {
    const occurrences = generateOccurrences({
      schedules: [
        {
          id: "sched-mon",
          courseId: "c1",
          dayOfWeek: "MON",
          startTime: "09:00",
          endTime: "10:00",
        },
      ],
      semesterStartDate: "2026-11-09",
      semesterEndDate: "2026-11-16",
      now: simulatedNow,
      timezone: "Asia/Kolkata",
    });

    expect(occurrences.map((o) => o.date)).toEqual(["2026-11-09", "2026-11-16"]);
  });

  // 13. Holiday exception
  it("holiday exception: marks occurrence as cancelled when holiday exception of type cancelled matches occurrence date", () => {
    const exceptions: OccurrenceException[] = [
      {
        id: "ex-holiday",
        classScheduleId: "sched-mon",
        date: "2026-11-09",
        type: "cancelled",
      },
    ];

    const occurrences = generateOccurrences({
      schedules: [baseSchedules[0]],
      exceptions,
      startDate: "2026-11-09",
      endDate: "2026-11-09",
      now: simulatedNow,
      timezone: "Asia/Kolkata",
    });

    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].status).toBe("cancelled");
    expect(occurrences[0].isException).toBe(true);
    expect(occurrences[0].exceptionType).toBe("cancelled");
  });

  // 14. Holiday exception metadata
  it("holiday exception: preserves original schedule time and location metadata on cancelled exception", () => {
    const exceptions: OccurrenceException[] = [
      {
        id: "ex-holiday",
        classScheduleId: "sched-mon",
        date: "2026-11-09",
        type: "cancelled",
      },
    ];

    const occurrences = generateOccurrences({
      schedules: [baseSchedules[0]],
      exceptions,
      startDate: "2026-11-09",
      endDate: "2026-11-09",
      now: simulatedNow,
      timezone: "Asia/Kolkata",
    });

    expect(occurrences[0].startTime).toBe("09:00");
    expect(occurrences[0].endTime).toBe("10:30");
    expect(occurrences[0].location).toBe("Room 101");
  });

  // 15. Rescheduled same day
  it("rescheduled to another time same day: updates startTime, endTime, and location when rescheduled to another time on the same date", () => {
    const exceptions: OccurrenceException[] = [
      {
        id: "ex-shift",
        classScheduleId: "sched-mon",
        date: "2026-11-09",
        type: "rescheduled",
        newStartTime: "15:00",
        newEndTime: "16:30",
        newLocation: "Auditorium",
      },
    ];

    const occurrences = generateOccurrences({
      schedules: [baseSchedules[0]],
      exceptions,
      startDate: "2026-11-09",
      endDate: "2026-11-09",
      now: simulatedNow,
      timezone: "Asia/Kolkata",
    });

    expect(occurrences[0].startTime).toBe("15:00");
    expect(occurrences[0].endTime).toBe("16:30");
    expect(occurrences[0].location).toBe("Auditorium");
    expect(occurrences[0].exceptionType).toBe("rescheduled");
  });

  // 16. Rescheduled metadata
  it("rescheduled to another date: updates occurrence metadata and sets exceptionType to rescheduled", () => {
    const exceptions: OccurrenceException[] = [
      {
        id: "ex-resched-date",
        classScheduleId: "sched-wed",
        date: "2026-11-11",
        type: "rescheduled",
        newStartTime: "13:00",
        newEndTime: "14:00",
      },
    ];

    const occurrences = generateOccurrences({
      schedules: [baseSchedules[1]],
      exceptions,
      startDate: "2026-11-11",
      endDate: "2026-11-11",
      now: simulatedNow,
      timezone: "Asia/Kolkata",
    });

    expect(occurrences[0].isException).toBe(true);
    expect(occurrences[0].exceptionType).toBe("rescheduled");
    expect(occurrences[0].startTime).toBe("13:00");
  });

  // 17. Orphan exception on date with no occurrence
  it("exception on a date with no occurrence: ignores ScheduleException on a date with no recurring occurrence without crashing or creating ghost classes", () => {
    const exceptions: OccurrenceException[] = [
      {
        id: "ex-orphan",
        classScheduleId: "sched-mon",
        date: "2026-11-10", // Tuesday (schedule only runs on Monday)
        type: "cancelled",
      },
    ];

    const occurrences = generateOccurrences({
      schedules: [baseSchedules[0]], // MON only
      exceptions,
      startDate: "2026-11-10",
      endDate: "2026-11-10",
      now: simulatedNow,
      timezone: "Asia/Kolkata",
    });

    // Tuesday has no Monday schedule, so 0 occurrences are created
    expect(occurrences).toHaveLength(0);
  });

  // 18. Class crossing midnight
  it("class crossing midnight: correctly marks timingStatus as in_progress for classes crossing midnight (e.g. 23:30 to 00:30)", () => {
    const lateSchedule: OccurrenceSchedule = {
      id: "sched-midnight",
      courseId: "c1",
      dayOfWeek: "WED",
      startTime: "23:30",
      endTime: "00:30",
    };

    // Simulated now: Wednesday 23:45 in Asia/Kolkata (18:15 UTC)
    const at2345 = new Date("2026-11-18T18:15:00.000Z");

    const occurrences = generateOccurrences({
      schedules: [lateSchedule],
      startDate: "2026-11-18",
      endDate: "2026-11-18",
      now: at2345,
      timezone: "Asia/Kolkata",
    });

    expect(occurrences[0].timingStatus).toBe("in_progress");
  });

  // 19. Empty semester: inverted dates
  it("empty semester: returns empty occurrences array when semester start date is after semester end date", () => {
    const occurrences = generateOccurrences({
      schedules: baseSchedules,
      startDate: "2026-11-20",
      endDate: "2026-11-10", // start > end
      now: simulatedNow,
      timezone: "Asia/Kolkata",
    });

    expect(occurrences).toEqual([]);
  });

  // 20. Empty semester: no schedules
  it("empty semester: returns empty occurrences array when no schedules are provided", () => {
    const occurrences = generateOccurrences({
      schedules: [],
      startDate: "2026-11-01",
      endDate: "2026-11-30",
      now: simulatedNow,
      timezone: "Asia/Kolkata",
    });

    expect(occurrences).toEqual([]);
  });

  // 21. Schedule with no semester dates
  it("schedule with no semester dates: defaults to today as single-day range when semester dates and range are omitted", () => {
    const occurrences = generateOccurrences({
      schedules: baseSchedules,
      now: simulatedNow, // Wed Nov 18
      timezone: "Asia/Kolkata",
    });

    // Should evaluate only for Nov 18 (Wed)
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].date).toBe("2026-11-18");
    expect(occurrences[0].classScheduleId).toBe("sched-wed");
  });

  // 22. Legacy record unique match
  it("legacy-record matching (unique match): matches legacy record (classScheduleId null) to occurrence when exactly one schedule runs that day", () => {
    const legacyRecords: OccurrenceRecord[] = [
      {
        id: "legacy-rec-1",
        courseId: "course-cs101",
        classScheduleId: null,
        date: "2026-11-09", // Monday: exactly 1 schedule runs
        status: "present",
      },
    ];

    const occurrences = generateOccurrences({
      schedules: [baseSchedules[0]],
      records: legacyRecords,
      startDate: "2026-11-09",
      endDate: "2026-11-09",
      now: simulatedNow,
      timezone: "Asia/Kolkata",
    });

    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].status).toBe("present");
    expect(occurrences[0].attendanceRecordId).toBe("legacy-rec-1");
    expect(occurrences[0].needsReview).toBeFalsy();
  });

  // 23. Legacy record ambiguous match
  it("legacy-record matching (ambiguous): leaves legacy record unmatched and flags occurrences with needsReview when multiple schedules run on the same day", () => {
    const multiSchedules: OccurrenceSchedule[] = [
      {
        id: "sched-mon-1",
        courseId: "course-cs101",
        dayOfWeek: "MON",
        startTime: "09:00",
        endTime: "10:00",
      },
      {
        id: "sched-mon-2",
        courseId: "course-cs101",
        dayOfWeek: "MON",
        startTime: "14:00",
        endTime: "15:00",
      },
    ];

    const legacyRecords: OccurrenceRecord[] = [
      {
        id: "legacy-ambiguous",
        courseId: "course-cs101",
        classScheduleId: null,
        date: "2026-11-09",
        status: "present",
      },
    ];

    const occurrences = generateOccurrences({
      schedules: multiSchedules,
      records: legacyRecords,
      startDate: "2026-11-09",
      endDate: "2026-11-09",
      now: simulatedNow,
      timezone: "Asia/Kolkata",
    });

    expect(occurrences).toHaveLength(2);
    // Neither occurrence should inherit the ambiguous legacy record
    expect(occurrences[0].status).toBe("unmarked");
    expect(occurrences[0].attendanceRecordId).toBeUndefined();
    expect(occurrences[0].needsReview).toBe(true);

    expect(occurrences[1].status).toBe("unmarked");
    expect(occurrences[1].attendanceRecordId).toBeUndefined();
    expect(occurrences[1].needsReview).toBe(true);
  });

  // 24. Legacy record no match
  it("legacy-record matching (none): leaves legacy record unmatched when no schedules run on that date", () => {
    const legacyRecords: OccurrenceRecord[] = [
      {
        id: "legacy-sunday",
        courseId: "course-cs101",
        classScheduleId: null,
        date: "2026-11-08", // Sunday
        status: "present",
      },
    ];

    const occurrences = generateOccurrences({
      schedules: [baseSchedules[0]], // MON only
      records: legacyRecords,
      startDate: "2026-11-08",
      endDate: "2026-11-09",
      now: simulatedNow,
      timezone: "Asia/Kolkata",
    });

    // Sunday has no occurrence; Monday has no legacy record so remains unmarked
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].date).toBe("2026-11-09");
    expect(occurrences[0].status).toBe("unmarked");
  });

  // 25. Past unmarked vs future
  it("past unmarked vs future: past unrecorded occurrences have isPast true and status unmarked", () => {
    // simulatedNow is Wed Nov 18
    const occurrences = generateOccurrences({
      schedules: baseSchedules,
      startDate: "2026-11-09",
      endDate: "2026-11-09",
      now: simulatedNow,
      timezone: "Asia/Kolkata",
    });

    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].date).toBe("2026-11-09");
    expect(occurrences[0].isPast).toBe(true);
    expect(occurrences[0].isFuture).toBe(false);
    expect(occurrences[0].status).toBe("unmarked");
  });

  // 26. Future unrecorded
  it("past unmarked vs future: future unrecorded occurrences have isFuture true and status unmarked without appearing in deficit", () => {
    // simulatedNow is Wed Nov 18; test Nov 23 (future Monday)
    const occurrences = generateOccurrences({
      schedules: baseSchedules,
      startDate: "2026-11-23",
      endDate: "2026-11-23",
      now: simulatedNow,
      timezone: "Asia/Kolkata",
    });

    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].date).toBe("2026-11-23");
    expect(occurrences[0].isPast).toBe(false);
    expect(occurrences[0].isFuture).toBe(true);
    expect(occurrences[0].status).toBe("unmarked");
  });

  // 27. Cancellation rule override
  it("cancellation rule: a cancelled ScheduleException overrides an existing present attendance record to status cancelled", () => {
    const existingPresentRecord: OccurrenceRecord = {
      id: "rec-present",
      courseId: "course-cs101",
      classScheduleId: "sched-mon",
      date: "2026-11-09",
      status: "present",
    };

    const cancelledException: OccurrenceException = {
      id: "ex-cancel",
      classScheduleId: "sched-mon",
      date: "2026-11-09",
      type: "cancelled",
    };

    const occurrences = generateOccurrences({
      schedules: [baseSchedules[0]],
      records: [existingPresentRecord],
      exceptions: [cancelledException],
      startDate: "2026-11-09",
      endDate: "2026-11-09",
      now: simulatedNow,
      timezone: "Asia/Kolkata",
    });

    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].status).toBe("cancelled");
    expect(occurrences[0].attendanceRecordId).toBe("rec-present"); // preserved record ID
    expect(occurrences[0].isException).toBe(true);
    expect(occurrences[0].exceptionType).toBe("cancelled");
  });
});
