import { describe, it, expect, vi, beforeEach } from "vitest";
import { markAttendance } from "../actions";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/auth", () => ({
  getCurrentUserId: vi.fn(async () => "user-test-123"),
  UnauthorizedError: class UnauthorizedError extends Error {
    constructor(msg = "Unauthorized") {
      super(msg);
      this.name = "UnauthorizedError";
    }
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    course: {
      findFirst: vi.fn(),
    },
    attendanceRecord: {
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
    notificationPreference: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("Unified Attendance Marking Server Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects invalid input schema (empty courseId or invalid date format)", async () => {
    await expect(
      markAttendance({
        courseId: "",
        date: "2026-11-24",
        status: "present",
      })
    ).rejects.toThrow();

    await expect(
      markAttendance({
        courseId: "course-1",
        date: "24-11-2026", // Invalid format
        status: "present",
      })
    ).rejects.toThrow();
  });

  it("upserts idempotently on (classScheduleId, date) when classScheduleId is provided", async () => {
    (prisma.course.findFirst as any).mockResolvedValue({
      id: "course-1",
      attendanceMode: "auto",
    });

    (prisma.attendanceRecord.upsert as any).mockResolvedValue({
      id: "rec-1",
      courseId: "course-1",
      classScheduleId: "sched-101",
      date: new Date(Date.UTC(2026, 10, 24)),
      status: "present",
    });

    (prisma.attendanceRecord.findMany as any).mockResolvedValue([
      { status: "present" },
    ]);

    const result = await markAttendance({
      courseId: "course-1",
      classScheduleId: "sched-101",
      date: "2026-11-24",
      status: "present",
    });

    expect(result.success).toBe(true);
    expect(result.record.classScheduleId).toBe("sched-101");
    expect(result.summary.present).toBe(1);
    expect(result.summary.percent).toBe(100);

    expect(prisma.attendanceRecord.upsert).toHaveBeenCalledWith({
      where: {
        classScheduleId_date: {
          classScheduleId: "sched-101",
          date: new Date(Date.UTC(2026, 10, 24)),
        },
      },
      update: {
        status: "present",
        courseId: "course-1",
      },
      create: {
        courseId: "course-1",
        classScheduleId: "sched-101",
        date: new Date(Date.UTC(2026, 10, 24)),
        status: "present",
      },
    });
  });

  it("maps status 'unmarked' to database enum 'not_marked'", async () => {
    (prisma.course.findFirst as any).mockResolvedValue({
      id: "course-1",
      attendanceMode: "auto",
    });

    (prisma.attendanceRecord.upsert as any).mockResolvedValue({
      id: "rec-1",
      courseId: "course-1",
      classScheduleId: "sched-101",
      date: new Date(Date.UTC(2026, 10, 24)),
      status: "not_marked",
    });

    (prisma.attendanceRecord.findMany as any).mockResolvedValue([]);

    const result = await markAttendance({
      courseId: "course-1",
      classScheduleId: "sched-101",
      date: "2026-11-24",
      status: "unmarked",
    });

    expect(result.record.status).toBe("not_marked");
    expect(prisma.attendanceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ status: "not_marked" }),
        create: expect.objectContaining({ status: "not_marked" }),
      })
    );
  });

  describe("Same-Day Multi-Schedule & Legacy Matching Guarantees", () => {
    // In-memory records store to simulate database persistence
    let inMemoryRecords: Array<{
      id: string;
      courseId: string;
      classScheduleId: string | null;
      date: Date;
      status: any;
    }> = [];

    beforeEach(() => {
      inMemoryRecords = [];

      (prisma.course.findFirst as any).mockResolvedValue({
        id: "course-1",
        attendanceMode: "auto",
      });

      (prisma.attendanceRecord.findMany as any).mockImplementation(async () => {
        return inMemoryRecords;
      });

      (prisma.attendanceRecord.upsert as any).mockImplementation(
        async ({ where, update, create }: any) => {
          const { classScheduleId, date } = where.classScheduleId_date;
          const existingIdx = inMemoryRecords.findIndex(
            (r) =>
              r.classScheduleId === classScheduleId &&
              r.date.getTime() === date.getTime()
          );

          if (existingIdx >= 0) {
            inMemoryRecords[existingIdx] = {
              ...inMemoryRecords[existingIdx],
              ...update,
            };
            return inMemoryRecords[existingIdx];
          } else {
            const newRec = {
              id: `rec-${inMemoryRecords.length + 1}`,
              ...create,
            };
            inMemoryRecords.push(newRec);
            return newRec;
          }
        }
      );
    });

    it("two classes of the same course on the same day can both be marked and both persist", async () => {
      // Mark Class 1 (Morning lecture)
      const res1 = await markAttendance({
        courseId: "course-1",
        classScheduleId: "sched-morning",
        date: "2026-11-24",
        status: "present",
      });

      // Mark Class 2 (Afternoon lab)
      const res2 = await markAttendance({
        courseId: "course-1",
        classScheduleId: "sched-afternoon",
        date: "2026-11-24",
        status: "absent",
      });

      expect(res1.record.classScheduleId).toBe("sched-morning");
      expect(res2.record.classScheduleId).toBe("sched-afternoon");

      // Both records exist independently for the same course on the same day
      expect(inMemoryRecords).toHaveLength(2);
      expect(inMemoryRecords).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            courseId: "course-1",
            classScheduleId: "sched-morning",
            status: "present",
          }),
          expect.objectContaining({
            courseId: "course-1",
            classScheduleId: "sched-afternoon",
            status: "absent",
          }),
        ])
      );
    });

    it("marking one never changes the other", async () => {
      // Initialize with Class 1 (present) and Class 2 (absent)
      inMemoryRecords = [
        {
          id: "rec-morning",
          courseId: "course-1",
          classScheduleId: "sched-morning",
          date: new Date(Date.UTC(2026, 10, 24)),
          status: "present",
        },
        {
          id: "rec-afternoon",
          courseId: "course-1",
          classScheduleId: "sched-afternoon",
          date: new Date(Date.UTC(2026, 10, 24)),
          status: "absent",
        },
      ];

      // Update Class 1 to "cancelled"
      await markAttendance({
        courseId: "course-1",
        classScheduleId: "sched-morning",
        date: "2026-11-24",
        status: "cancelled",
      });

      // Class 1 is updated, Class 2 remains absent
      const morning = inMemoryRecords.find((r) => r.classScheduleId === "sched-morning");
      const afternoon = inMemoryRecords.find((r) => r.classScheduleId === "sched-afternoon");

      expect(morning?.status).toBe("cancelled");
      expect(afternoon?.status).toBe("absent");
    });

    it("double-marking stays idempotent with no duplicate records", async () => {
      // Mark present
      await markAttendance({
        courseId: "course-1",
        classScheduleId: "sched-morning",
        date: "2026-11-24",
        status: "present",
      });

      // Mark present again (rapid tap or retry)
      await markAttendance({
        courseId: "course-1",
        classScheduleId: "sched-morning",
        date: "2026-11-24",
        status: "present",
      });

      expect(inMemoryRecords).toHaveLength(1);
      expect(inMemoryRecords[0].status).toBe("present");
    });

    it("a legacy NULL-schedule row is not overwritten by a new mark", async () => {
      // Pre-existing legacy record with classScheduleId = null
      const legacyRecord = {
        id: "legacy-rec-999",
        courseId: "course-1",
        classScheduleId: null,
        date: new Date(Date.UTC(2026, 10, 24)),
        status: "present",
      };
      inMemoryRecords = [legacyRecord];

      // New mark on a specific schedule on that same date
      await markAttendance({
        courseId: "course-1",
        classScheduleId: "sched-morning",
        date: "2026-11-24",
        status: "absent",
      });

      // Legacy record is completely untouched and preserved
      const legacy = inMemoryRecords.find((r) => r.id === "legacy-rec-999");
      expect(legacy).toBeDefined();
      expect(legacy?.classScheduleId).toBeNull();
      expect(legacy?.status).toBe("present");

      // New record is created separately
      const newRec = inMemoryRecords.find((r) => r.classScheduleId === "sched-morning");
      expect(newRec).toBeDefined();
      expect(newRec?.status).toBe("absent");

      expect(inMemoryRecords).toHaveLength(2);
    });
  });
});
