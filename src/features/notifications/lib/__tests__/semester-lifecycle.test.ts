import { describe, it, expect, vi, beforeEach } from "vitest";
import { withSimulatedTime } from "@/lib/clock";
import { runNotificationScheduler } from "../scheduler";
import { getCurrentSemester } from "@/features/semesters/lib/current";
import { semesterStatus } from "@/features/semesters/lib/status";
import { prisma } from "@/lib/prisma";

const mockSendNotification = vi.fn();

vi.mock("@/lib/auth", () => ({
  getCurrentUserId: vi.fn(async () => "user-life-1"),
}));

vi.mock("@/lib/timezone-server", () => ({
  getUserTimezone: vi.fn(async () => "Asia/Kathmandu"),
}));

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: (...args: unknown[]) => mockSendNotification(...args),
  },
}));

vi.mock("../subscription", () => ({
  getActiveSubscriptions: vi.fn(async () => [
    { id: "sub-1", endpoint: "https://push.example/1", p256dh: "k", auth: "a" },
  ]),
}));

const dbState = {
  semesters: [] as Array<{
    id: string;
    userId: string;
    name: string;
    startDate: Date;
    endDate: Date;
    isActive: boolean;
  }>,
  schedules: [] as Array<{
    id: string;
    courseId: string;
    dayOfWeek: string;
    startTime: string;
    endTime: string;
    location: string | null;
    semesterId: string;
  }>,
};

function matchesSemesterRange(
  sem: { userId: string; startDate: Date; endDate: Date },
  where: {
    startDate?: { lte?: Date };
    endDate?: { gte?: Date };
  }
): boolean {
  if (where.startDate?.lte && sem.startDate > where.startDate.lte) return false;
  if (where.endDate?.gte && sem.endDate < where.endDate.gte) return false;
  return true;
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pushSubscription: {
      findMany: vi.fn(async () => [{ userId: "user-life-1" }]),
    },
    notificationPreference: {
      findFirst: vi.fn(async () => ({ timezone: "Asia/Kathmandu" })),
      findMany: vi.fn(async () => []),
    },
    semester: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const match = dbState.semesters.find((s) => matchesSemesterRange(s, where));
        return match ?? null;
      }),
    },
    classSchedule: {
      findMany: vi.fn(async ({ where }: { where: { course?: { semester?: Record<string, unknown> } } }) => {
        const semWhere = where?.course?.semester;
        return dbState.schedules.filter((sched) => {
          const sem = dbState.semesters.find((s) => s.id === sched.semesterId);
          if (!sem) return false;
          return semWhere ? matchesSemesterRange(sem, semWhere) : true;
        });
      }),
    },
    scheduleException: { findMany: vi.fn(async () => []) },
    assessment: { findMany: vi.fn(async () => []) },
    routine: { findMany: vi.fn(async () => []) },
    task: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) },
    review: { findFirst: vi.fn(async () => null) },
    sentNotification: {
      findUnique: vi.fn(async () => null),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  },
}));

describe("Semester Lifecycle & Scheduler Isolation (A4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.semesters = [];
    dbState.schedules = [];
  });

  it("ended semester produces NO class reminders and NO attendance prompts under simulated asOf clock", async () => {
    // Semester ended on 2026-11-20, even though stale isActive=true flag is set
    dbState.semesters = [
      {
        id: "sem-ended",
        userId: "user-life-1",
        name: "Fall 2026",
        startDate: new Date("2026-08-01T00:00:00.000Z"),
        endDate: new Date("2026-11-20T00:00:00.000Z"),
        isActive: true,
      },
    ];
    dbState.schedules = [
      {
        id: "sched-1",
        courseId: "c-1",
        semesterId: "sem-ended",
        dayOfWeek: "SAT",
        startTime: "09:00",
        endTime: "10:00",
        location: "Room 101",
      },
    ];

    // 2026-11-21 08:45 Asia/Kathmandu (03:00Z) is 15 mins before 09:00 class
    await withSimulatedTime("2026-11-21T03:00:00.000Z", async () => {
      const current = await getCurrentSemester("user-life-1");
      expect(current).toBeNull();

      await runNotificationScheduler(true);
      expect(mockSendNotification).not.toHaveBeenCalled();
    });
  });

  it("semester starting tomorrow is upcoming and not returned as current", async () => {
    dbState.semesters = [
      {
        id: "sem-future",
        userId: "user-life-1",
        name: "Spring 2027",
        startDate: new Date("2026-11-26T00:00:00.000Z"),
        endDate: new Date("2027-03-20T00:00:00.000Z"),
        isActive: false,
      },
    ];

    expect(semesterStatus(dbState.semesters[0], "2026-11-25")).toBe("upcoming");

    const current = await getCurrentSemester(
      "user-life-1",
      new Date("2026-11-25T10:00:00.000Z")
    );
    expect(current).toBeNull();
  });
});
