import { describe, it, expect, vi, beforeEach } from "vitest";
import { withSimulatedTime } from "@/lib/clock";
import { runNotificationScheduler } from "../scheduler";

const dbState = {
  userId: "user-sim-1",
  timezone: "Asia/Kathmandu",
  prefs: [] as Array<{
    userId: string;
    type: string;
    enabled: boolean;
    priority: string;
    quietHoursStart: string | null;
    quietHoursEnd: string | null;
    timezone: string | null;
  }>,
  subs: [] as Array<{
    id: string;
    userId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    createdAt: Date;
  }>,
  sent: [] as Array<{
    userId: string;
    tag: string;
    dedupKey: string | null;
    type: string;
    sentAt: Date;
  }>,
  semesters: [] as Array<{
    id: string;
    userId: string;
    startDate: Date;
    endDate: Date;
    isActive: boolean;
  }>,
  schedules: [] as Array<{
    id: string;
    courseId: string;
    semesterId: string;
    dayOfWeek: string;
    startTime: string;
    endTime: string;
    location: string | null;
    course: { id: string; name: string; color: string | null };
    exceptions: Array<{
      id: string;
      date: Date;
      type: string;
      newStartTime: string | null;
      newEndTime: string | null;
      newLocation: string | null;
    }>;
  }>,
  attendance: [] as Array<{
    courseId: string;
    classScheduleId: string | null;
    date: Date;
    status: string;
  }>,
  tasks: [] as Array<{
    id: string;
    userId: string;
    title: string;
    status: string;
    dueDate: Date | null;
    course: { name: string } | null;
  }>,
  events: [] as Array<{
    id: string;
    userId: string;
    title: string;
    dateTime: Date;
    location: string | null;
  }>,
};

function matchesSemesterRange(
  sem: { startDate: Date; endDate: Date },
  where: { startDate?: { lte?: Date }; endDate?: { gte?: Date } }
) {
  if (where.startDate?.lte && sem.startDate > where.startDate.lte) return false;
  if (where.endDate?.gte && sem.endDate < where.endDate.gte) return false;
  return true;
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pushSubscription: {
      findMany: vi.fn(
        async ({
          where,
          distinct,
        }: { where?: { userId?: string }; distinct?: string[] } = {}) => {
          const rows = where?.userId
            ? dbState.subs.filter((s) => s.userId === where.userId)
            : dbState.subs;
          if (distinct?.includes("userId")) {
            const seen = new Set<string>();
            return rows.filter((r) => {
              if (seen.has(r.userId)) return false;
              seen.add(r.userId);
              return true;
            });
          }
          return rows;
        }
      ),
      deleteMany: vi.fn(async ({ where }: { where: { endpoint: string } }) => {
        const before = dbState.subs.length;
        dbState.subs = dbState.subs.filter((s) => s.endpoint !== where.endpoint);
        return { count: before - dbState.subs.length };
      }),
    },
    notificationPreference: {
      findFirst: vi.fn(async () => ({ timezone: dbState.timezone })),
      findMany: vi.fn(async () => dbState.prefs),
    },
    sentNotification: {
      findFirst: vi.fn(
        async ({
          where,
        }: {
          where: {
            userId: string;
            OR?: Array<{ dedupKey?: { in: string[] }; tag?: { in: string[] } }>;
          };
        }) => {
          const keys = new Set<string>();
          for (const clause of where.OR ?? []) {
            clause.dedupKey?.in?.forEach((k) => keys.add(k));
            clause.tag?.in?.forEach((k) => keys.add(k));
          }
          return (
            dbState.sent.find(
              (s) =>
                s.userId === where.userId &&
                ((s.dedupKey && keys.has(s.dedupKey)) || keys.has(s.tag))
            ) ?? null
          );
        }
      ),
      upsert: vi.fn(
        async ({
          create,
        }: {
          create: {
            userId: string;
            tag: string;
            dedupKey: string;
            type: string;
            sentAt: Date;
          };
        }) => {
          const exists = dbState.sent.find(
            (s) => s.userId === create.userId && s.dedupKey === create.dedupKey
          );
          if (!exists) dbState.sent.push(create);
          return exists ?? create;
        }
      ),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    classSchedule: {
      findMany: vi.fn(
        async ({
          where,
        }: {
          where: { course?: { semester?: { startDate?: { lte?: Date }; endDate?: { gte?: Date } } } };
        }) => {
          const semWhere = where?.course?.semester;
          return dbState.schedules.filter((sched) => {
            const sem = dbState.semesters.find((s) => s.id === sched.semesterId);
            if (!sem) return false;
            return semWhere ? matchesSemesterRange(sem, semWhere) : true;
          });
        }
      ),
    },
    attendanceRecord: {
      findFirst: vi.fn(
        async ({ where }: { where: { courseId: string; date: Date } }) => {
          return (
            dbState.attendance.find(
              (a) =>
                a.courseId === where.courseId &&
                a.date.getTime() === where.date.getTime()
            ) ?? null
          );
        }
      ),
    },
    task: {
      findMany: vi.fn(async () => dbState.tasks),
    },
    event: {
      findMany: vi.fn(async () => dbState.events),
    },
  },
}));

describe("Notification Engine Simulated-Clock Tests (Step 4)", () => {
  beforeEach(() => {
    dbState.prefs = [];
    dbState.sent = [];
    dbState.subs = [
      {
        id: "phone",
        userId: dbState.userId,
        endpoint: "https://push.example/phone",
        p256dh: "k1",
        auth: "a1",
        createdAt: new Date("2026-11-20T00:00:00Z"),
      },
      {
        id: "laptop",
        userId: dbState.userId,
        endpoint: "https://push.example/laptop",
        p256dh: "k2",
        auth: "a2",
        createdAt: new Date("2026-11-21T00:00:00Z"),
      },
    ];
    dbState.semesters = [
      {
        id: "sem-1",
        userId: dbState.userId,
        startDate: new Date("2026-08-01T00:00:00.000Z"),
        endDate: new Date("2026-12-20T00:00:00.000Z"),
        isActive: true,
      },
    ];
    // 2026-11-25 is WED
    dbState.schedules = [
      {
        id: "sched-1",
        courseId: "course-1",
        semesterId: "sem-1",
        dayOfWeek: "WED",
        startTime: "10:00",
        endTime: "11:00",
        location: "Room 101",
        course: { id: "course-1", name: "Algorithms", color: null },
        exceptions: [],
      },
    ];
    dbState.attendance = [];
    dbState.tasks = [];
    dbState.events = [];
  });

  it("fires class_start once across 12 consecutive 5-minute ticks and delivers to both phone and laptop", async () => {
    const sendPush = vi.fn().mockResolvedValue(undefined);
    // 2026-11-25 09:40 Asia/Kathmandu = 03:55 UTC (before 10-min window for 10:00 class)
    const startUtc = new Date("2026-11-25T03:55:00.000Z").getTime();

    let totalSentEvents = 0;
    for (let tick = 0; tick < 12; tick++) {
      const tickIso = new Date(startUtc + tick * 5 * 60 * 1000).toISOString();
      const res = await withSimulatedTime(tickIso, () =>
        runNotificationScheduler(false, { only: "class_start", sendPush })
      );
      totalSentEvents += res.sent;
    }

    expect(totalSentEvents).toBe(1);
    expect(sendPush).toHaveBeenCalledTimes(2); // phone + laptop
  });

  it("fires class_end, task_due, calendar_event, morning_brief, and evening_brief at right local time and never twice", async () => {
    const sendPush = vi.fn().mockResolvedValue(undefined);

    // Task at 14:00 NPT (08:15 UTC)
    dbState.tasks = [
      {
        id: "task-1",
        userId: dbState.userId,
        title: "Submit Lab",
        status: "open",
        dueDate: new Date("2026-11-25T08:15:00.000Z"),
        course: { name: "Algorithms" },
      },
    ];
    // Event at 16:00 NPT (10:15 UTC)
    dbState.events = [
      {
        id: "event-1",
        userId: dbState.userId,
        title: "Tutor Sync",
        dateTime: new Date("2026-11-25T10:15:00.000Z"),
        location: "Zoom",
      },
    ];

    // Morning brief at 07:05 NPT (01:20 UTC)
    const rMorning1 = await withSimulatedTime("2026-11-25T01:20:00.000Z", () =>
      runNotificationScheduler(false, { only: "morning_brief", sendPush })
    );
    const rMorning2 = await withSimulatedTime("2026-11-25T01:25:00.000Z", () =>
      runNotificationScheduler(false, { only: "morning_brief", sendPush })
    );
    expect(rMorning1.sent).toBe(1);
    expect(rMorning2.sent).toBe(0);

    // Class end at 11:05 NPT (05:20 UTC)
    const rEnd1 = await withSimulatedTime("2026-11-25T05:20:00.000Z", () =>
      runNotificationScheduler(false, { only: "class_end", sendPush })
    );
    const rEnd2 = await withSimulatedTime("2026-11-25T05:25:00.000Z", () =>
      runNotificationScheduler(false, { only: "class_end", sendPush })
    );
    expect(rEnd1.sent).toBe(1);
    expect(rEnd2.sent).toBe(0);

    // Task due at 13:50 NPT (08:05 UTC)
    const rTask1 = await withSimulatedTime("2026-11-25T08:05:00.000Z", () =>
      runNotificationScheduler(false, { only: "task_due", sendPush })
    );
    const rTask2 = await withSimulatedTime("2026-11-25T08:10:00.000Z", () =>
      runNotificationScheduler(false, { only: "task_due", sendPush })
    );
    expect(rTask1.sent).toBe(1);
    expect(rTask2.sent).toBe(0);

    // Calendar event at 15:50 NPT (10:05 UTC)
    const rEvent1 = await withSimulatedTime("2026-11-25T10:05:00.000Z", () =>
      runNotificationScheduler(false, { only: "calendar_event", sendPush })
    );
    const rEvent2 = await withSimulatedTime("2026-11-25T10:10:00.000Z", () =>
      runNotificationScheduler(false, { only: "calendar_event", sendPush })
    );
    expect(rEvent1.sent).toBe(1);
    expect(rEvent2.sent).toBe(0);

    // Evening brief at 20:35 NPT (14:50 UTC)
    const rEvening1 = await withSimulatedTime("2026-11-25T14:50:00.000Z", () =>
      runNotificationScheduler(false, { only: "evening_brief", sendPush })
    );
    const rEvening2 = await withSimulatedTime("2026-11-25T14:55:00.000Z", () =>
      runNotificationScheduler(false, { only: "evening_brief", sendPush })
    );
    expect(rEvening1.sent).toBe(1);
    expect(rEvening2.sent).toBe(0);

    // 5 events * 2 devices = 10 pushes
    expect(sendPush).toHaveBeenCalledTimes(10);
  });

  it("respects quiet hours for non-critical notifications", async () => {
    const sendPush = vi.fn().mockResolvedValue(undefined);
    dbState.prefs = [
      {
        userId: dbState.userId,
        type: "task_due",
        enabled: true,
        priority: "normal",
        quietHoursStart: "22:00",
        quietHoursEnd: "07:00",
        timezone: "Asia/Kathmandu",
      },
    ];
    dbState.tasks = [
      {
        id: "task-night",
        userId: dbState.userId,
        title: "Late Task",
        status: "open",
        // 23:30 NPT = 17:45 UTC
        dueDate: new Date("2026-11-25T17:45:00.000Z"),
        course: null,
      },
    ];

    // 23:20 NPT = 17:35 UTC (inside 22:00-07:00 quiet hours)
    const res = await withSimulatedTime("2026-11-25T17:35:00.000Z", () =>
      runNotificationScheduler(false, { only: "task_due", sendPush })
    );
    expect(res.sent).toBe(0);
    expect(res.skippedQuietHours).toBe(1);
    expect(sendPush).not.toHaveBeenCalled();
  });

  it("stays silent for ended semesters, skips cancelled classes, and skips already-marked attendance", async () => {
    const sendPush = vi.fn().mockResolvedValue(undefined);

    // 1. Ended semester
    dbState.semesters[0].endDate = new Date("2026-11-20T00:00:00.000Z");
    const endedRes = await withSimulatedTime("2026-11-25T04:05:00.000Z", () =>
      runNotificationScheduler(false, { only: "class_start", sendPush })
    );
    expect(endedRes.sent).toBe(0);

    // Restore active semester, add cancelled exception
    dbState.semesters[0].endDate = new Date("2026-12-20T00:00:00.000Z");
    dbState.schedules[0].exceptions = [
      {
        id: "exc-1",
        date: new Date("2026-11-25T00:00:00.000Z"),
        type: "cancelled",
        newStartTime: null,
        newEndTime: null,
        newLocation: null,
      },
    ];
    const cancelledRes = await withSimulatedTime("2026-11-25T04:05:00.000Z", () =>
      runNotificationScheduler(false, { only: "class_start", sendPush })
    );
    expect(cancelledRes.sent).toBe(0);

    // Clear exception, mark attendance as present -> class_end skipped
    dbState.schedules[0].exceptions = [];
    dbState.attendance = [
      {
        courseId: "course-1",
        classScheduleId: "sched-1",
        date: new Date("2026-11-25T00:00:00.000Z"),
        status: "present",
      },
    ];
    const markedRes = await withSimulatedTime("2026-11-25T05:20:00.000Z", () =>
      runNotificationScheduler(false, { only: "class_end", sendPush })
    );
    expect(markedRes.sent).toBe(0);
    expect(sendPush).not.toHaveBeenCalled();
  });

  it("removes a dead subscription on 410 and delivers to remaining subscription", async () => {
    const sendPush = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("Gone"), { statusCode: 410 }))
      .mockResolvedValueOnce(undefined);

    const res = await withSimulatedTime("2026-11-25T04:05:00.000Z", () =>
      runNotificationScheduler(false, { only: "class_start", sendPush })
    );
    expect(res.removedSubscriptions).toBe(1);
    expect(res.deliveredPushes).toBe(1);
    expect(dbState.subs).toHaveLength(1);
  });
});
