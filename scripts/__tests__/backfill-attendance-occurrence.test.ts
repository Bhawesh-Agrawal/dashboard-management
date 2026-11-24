import { describe, it, expect } from "vitest";
import { planAttendanceBackfill } from "../backfill-attendance-occurrence";

describe("planAttendanceBackfill", () => {
  const dummyCourse = {
    name: "Mathematics 101",
    classSchedules: [
      {
        id: "sched-mon",
        dayOfWeek: "MON" as const,
        startTime: "09:00",
        endTime: "10:30",
        effectiveStartDate: null,
        effectiveEndDate: null,
      },
      {
        id: "sched-wed",
        dayOfWeek: "WED" as const,
        startTime: "11:00",
        endTime: "12:30",
        effectiveStartDate: new Date("2026-08-01T00:00:00.000Z"),
        effectiveEndDate: new Date("2026-12-01T00:00:00.000Z"),
      },
    ],
  };

  it("skips records that already have classScheduleId", () => {
    const records = [
      {
        id: "rec-1",
        courseId: "course-1",
        classScheduleId: "already-set-id",
        date: new Date("2026-11-23T00:00:00.000Z"), // Monday
        course: dummyCourse,
      },
    ];

    const plan = planAttendanceBackfill(records);
    expect(plan.totalRecords).toBe(1);
    expect(plan.alreadyLinked).toBe(1);
    expect(plan.mappedCount).toBe(0);
    expect(plan.plannedUpdates).toHaveLength(0);
  });

  it("successfully maps a record when exactly one schedule matches weekday and effective range", () => {
    const records = [
      {
        id: "rec-mon",
        courseId: "course-1",
        classScheduleId: null,
        date: new Date("2026-11-23T00:00:00.000Z"), // Monday
        course: dummyCourse,
      },
      {
        id: "rec-wed",
        courseId: "course-1",
        classScheduleId: null,
        date: new Date("2026-11-25T00:00:00.000Z"), // Wednesday
        course: dummyCourse,
      },
    ];

    const plan = planAttendanceBackfill(records);
    expect(plan.mappedCount).toBe(2);
    expect(plan.unmappedCount).toBe(0);
    expect(plan.plannedUpdates).toEqual([
      {
        recordId: "rec-mon",
        courseId: "course-1",
        courseName: "Mathematics 101",
        date: "2026-11-23",
        dayOfWeek: "MON",
        classScheduleId: "sched-mon",
        timeSlot: "09:00-10:30",
      },
      {
        recordId: "rec-wed",
        courseId: "course-1",
        courseName: "Mathematics 101",
        date: "2026-11-25",
        dayOfWeek: "WED",
        classScheduleId: "sched-wed",
        timeSlot: "11:00-12:30",
      },
    ]);
  });

  it("reports unmapped when date is outside schedule effective date range", () => {
    const records = [
      {
        id: "rec-wed-old",
        courseId: "course-1",
        classScheduleId: null,
        date: new Date("2026-05-13T00:00:00.000Z"), // Wednesday before Aug 1
        course: dummyCourse,
      },
    ];

    const plan = planAttendanceBackfill(records);
    expect(plan.mappedCount).toBe(0);
    expect(plan.unmappedCount).toBe(1);
    expect(plan.unmappedRecords[0].reason).toContain("No class schedule found for course on WED");
  });

  it("reports unmapped with clear reason when multiple schedules exist on the same weekday (ambiguous)", () => {
    const multiCourse = {
      name: "Physics Lab & Lecture",
      classSchedules: [
        {
          id: "sched-fri-1",
          dayOfWeek: "FRI" as const,
          startTime: "09:00",
          endTime: "10:00",
          effectiveStartDate: null,
          effectiveEndDate: null,
        },
        {
          id: "sched-fri-2",
          dayOfWeek: "FRI" as const,
          startTime: "14:00",
          endTime: "16:00",
          effectiveStartDate: null,
          effectiveEndDate: null,
        },
      ],
    };

    const records = [
      {
        id: "rec-fri",
        courseId: "course-2",
        classScheduleId: null,
        date: new Date("2026-11-27T00:00:00.000Z"), // Friday
        course: multiCourse,
      },
    ];

    const plan = planAttendanceBackfill(records);
    expect(plan.mappedCount).toBe(0);
    expect(plan.unmappedCount).toBe(1);
    expect(plan.unmappedRecords[0].reason).toContain("Ambiguous match: 2 schedules found on FRI");
  });
});
