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
});
