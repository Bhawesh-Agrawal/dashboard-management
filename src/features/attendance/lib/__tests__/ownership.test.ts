import { describe, it, expect, vi, beforeEach } from "vitest";
import { markAttendance, bulkMarkAttendance, getAttendanceSummary } from "../actions";
import { prisma } from "@/lib/prisma";
import { UnauthorizedError } from "@/lib/auth";

vi.mock("@/lib/auth", () => ({
  getCurrentUserId: vi.fn(async () => "user-owner-1"),
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
    $transaction: vi.fn(async (ops) => Promise.all(ops)),
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("Attendance Ownership Scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("markAttendance throws UnauthorizedError when course does not belong to user", async () => {
    (prisma.course.findFirst as any).mockResolvedValue(null);

    await expect(
      markAttendance({
        courseId: "course-unauthorized",
        date: "2026-03-15",
        status: "present",
      })
    ).rejects.toThrow(UnauthorizedError);

    expect(prisma.course.findFirst).toHaveBeenCalledWith({
      where: {
        id: "course-unauthorized",
        semester: { OR: [{ userId: "user-owner-1" }, { userId: null }] },
      },
    });
  });

  it("markAttendance succeeds when course belongs to user", async () => {
    (prisma.course.findFirst as any).mockResolvedValue({
      id: "course-valid",
      name: "Algorithms",
    });
    (prisma.attendanceRecord.upsert as any).mockResolvedValue({
      id: "att-1",
      courseId: "course-valid",
      status: "present",
    });

    const result = await markAttendance({
      courseId: "course-valid",
      date: "2026-03-15",
      status: "present",
    });

    expect(result).toBeDefined();
    expect(result.status).toBe("present");
    expect(prisma.attendanceRecord.upsert).toHaveBeenCalled();
  });

  it("bulkMarkAttendance throws UnauthorizedError when course is unauthorized", async () => {
    (prisma.course.findFirst as any).mockResolvedValue(null);

    await expect(
      bulkMarkAttendance("course-unauthorized", [
        { date: "2026-03-15", status: "present" },
      ])
    ).rejects.toThrow(UnauthorizedError);
  });

  it("getAttendanceSummary throws UnauthorizedError when course is unauthorized", async () => {
    (prisma.course.findFirst as any).mockResolvedValue(null);

    await expect(getAttendanceSummary("course-unauthorized")).rejects.toThrow(
      UnauthorizedError
    );
  });
});
