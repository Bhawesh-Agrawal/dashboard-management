import { describe, it, expect } from "vitest";
import { generateOccurrences, OccurrenceSchedule, OccurrenceException, OccurrenceRecord } from "../occurrences";

describe("Occurrence Engine (generateOccurrences)", () => {
  const schedules: OccurrenceSchedule[] = [
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
      effectiveStartDate: "2026-11-10",
      effectiveEndDate: "2026-11-25",
    },
  ];

  // Simulated "now": Wednesday 2026-11-18 at 11:30 in Asia/Kolkata (UTC 06:00)
  const simulatedNow = new Date("2026-11-18T06:00:00.000Z");

  it("generates occurrences across a date range without pre-created rows", () => {
    // 2 weeks: Nov 9 (Mon) to Nov 22 (Sun)
    const occurrences = generateOccurrences({
      schedules,
      startDate: "2026-11-09",
      endDate: "2026-11-22",
      now: simulatedNow,
      timezone: "Asia/Kolkata",
    });

    // Mon Nov 9 (sched-mon)
    // Wed Nov 11 (sched-wed) [effective after Nov 10]
    // Mon Nov 16 (sched-mon)
    // Wed Nov 18 (sched-wed)
    expect(occurrences).toHaveLength(4);
    expect(occurrences.map((o) => `${o.date} ${o.dayOfWeek}`)).toEqual([
      "2026-11-09 MON",
      "2026-11-11 WED",
      "2026-11-16 MON",
      "2026-11-18 WED",
    ]);

    // All should default to unmarked if no records exist
    for (const occ of occurrences) {
      expect(occ.status).toBe("unmarked");
    }
  });

  it("marks past unrecorded occurrences as 'unmarked'", () => {
    const occurrences = generateOccurrences({
      schedules,
      startDate: "2026-11-09",
      endDate: "2026-11-16",
      now: simulatedNow,
      timezone: "Asia/Kolkata",
    });

    expect(occurrences).toHaveLength(3);
    expect(occurrences[0].date).toBe("2026-11-09");
    expect(occurrences[0].isPast).toBe(true);
    expect(occurrences[0].status).toBe("unmarked");
  });

  it("attaches existing attendance records and maps status accurately", () => {
    const records: OccurrenceRecord[] = [
      {
        id: "rec-1",
        courseId: "course-cs101",
        classScheduleId: "sched-mon",
        date: "2026-11-09",
        status: "present",
      },
      {
        id: "rec-2",
        courseId: "course-cs101",
        classScheduleId: "sched-wed",
        date: "2026-11-11",
        status: "absent",
      },
      {
        id: "rec-3",
        courseId: "course-cs101",
        classScheduleId: "sched-mon",
        date: "2026-11-16",
        status: "not_marked",
      },
    ];

    const occurrences = generateOccurrences({
      schedules,
      records,
      startDate: "2026-11-09",
      endDate: "2026-11-18",
      now: simulatedNow,
      timezone: "Asia/Kolkata",
    });

    expect(occurrences[0].status).toBe("present");
    expect(occurrences[0].attendanceRecordId).toBe("rec-1");

    expect(occurrences[1].status).toBe("absent");
    expect(occurrences[1].attendanceRecordId).toBe("rec-2");

    expect(occurrences[2].status).toBe("unmarked"); // not_marked maps to unmarked
    expect(occurrences[2].attendanceRecordId).toBe("rec-3");

    expect(occurrences[3].status).toBe("unmarked"); // no record exists
    expect(occurrences[3].attendanceRecordId).toBeUndefined();
  });

  it("handles cancelled and rescheduled ScheduleExceptions", () => {
    const exceptions: OccurrenceException[] = [
      {
        id: "ex-cancel",
        classScheduleId: "sched-mon",
        date: "2026-11-09",
        type: "cancelled",
      },
      {
        id: "ex-resched",
        classScheduleId: "sched-wed",
        date: "2026-11-11",
        type: "rescheduled",
        newStartTime: "14:00",
        newEndTime: "15:30",
        newLocation: "Lab 3",
      },
    ];

    const occurrences = generateOccurrences({
      schedules,
      exceptions,
      startDate: "2026-11-09",
      endDate: "2026-11-11",
      now: simulatedNow,
      timezone: "Asia/Kolkata",
    });

    // Mon Nov 9 cancelled
    expect(occurrences[0].status).toBe("cancelled");
    expect(occurrences[0].isException).toBe(true);
    expect(occurrences[0].exceptionType).toBe("cancelled");

    // Wed Nov 11 rescheduled
    expect(occurrences[1].startTime).toBe("14:00");
    expect(occurrences[1].endTime).toBe("15:30");
    expect(occurrences[1].location).toBe("Lab 3");
    expect(occurrences[1].isException).toBe(true);
    expect(occurrences[1].exceptionType).toBe("rescheduled");
  });

  it("supports multiple classes on the same weekday for the same course", () => {
    const multiSchedules: OccurrenceSchedule[] = [
      {
        id: "sched-mon-lecture",
        courseId: "course-cs101",
        dayOfWeek: "MON",
        startTime: "09:00",
        endTime: "10:00",
      },
      {
        id: "sched-mon-lab",
        courseId: "course-cs101",
        dayOfWeek: "MON",
        startTime: "14:00",
        endTime: "16:00",
      },
    ];

    const occurrences = generateOccurrences({
      schedules: multiSchedules,
      startDate: "2026-11-09",
      endDate: "2026-11-09",
      now: simulatedNow,
      timezone: "Asia/Kolkata",
    });

    expect(occurrences).toHaveLength(2);
    expect(occurrences[0].classScheduleId).toBe("sched-mon-lecture");
    expect(occurrences[0].startTime).toBe("09:00");
    expect(occurrences[1].classScheduleId).toBe("sched-mon-lab");
    expect(occurrences[1].startTime).toBe("14:00");
  });

  it("calculates timingStatus accurately for classes today", () => {
    // simulatedNow is Wed Nov 18, 11:30 in Asia/Kolkata
    const todaySchedules: OccurrenceSchedule[] = [
      {
        id: "sched-past-today",
        courseId: "course-cs101",
        dayOfWeek: "WED",
        startTime: "08:00",
        endTime: "09:30",
      },
      {
        id: "sched-current-today",
        courseId: "course-cs101",
        dayOfWeek: "WED",
        startTime: "11:00",
        endTime: "12:00",
      },
      {
        id: "sched-future-today",
        courseId: "course-cs101",
        dayOfWeek: "WED",
        startTime: "15:00",
        endTime: "16:00",
      },
    ];

    const occurrences = generateOccurrences({
      schedules: todaySchedules,
      startDate: "2026-11-18",
      endDate: "2026-11-18",
      now: simulatedNow,
      timezone: "Asia/Kolkata",
    });

    expect(occurrences[0].timingStatus).toBe("ended");
    expect(occurrences[1].timingStatus).toBe("in_progress");
    expect(occurrences[2].timingStatus).toBe("upcoming");

    expect(occurrences[0].isToday).toBe(true);
    expect(occurrences[1].isToday).toBe(true);
    expect(occurrences[2].isToday).toBe(true);
  });
});
