import { describe, it, expect, vi, beforeEach } from "vitest";
import { withSimulatedTime } from "@/lib/clock";
import { runNotificationScheduler } from "../scheduler";

const state = {
  userId: "user-brief-1",
  timezone: "Asia/Kathmandu",
  prefs: [] as Array<{
    userId: string;
    type: string;
    enabled: boolean;
    priority: string;
    dailySummaryTime: string | null;
    quietHoursStart: string | null;
    quietHoursEnd: string | null;
    timezone: string | null;
    reminderMinutes: number | null;
  }>,
  sent: [] as Array<{
    userId: string;
    tag: string;
    dedupKey: string | null;
    type: string;
    sentAt: Date;
  }>,
};

vi.mock("@/features/briefs/lib/generate", () => ({
  generateAndPersistBrief: vi.fn(async ({ kind }: { kind: string }) => ({
    pushSummary: `${kind} brief summary`,
  })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pushSubscription: {
      findMany: vi.fn(async () => [
        {
          id: "sub-1",
          userId: state.userId,
          endpoint: "https://push.example/1",
          p256dh: "k",
          auth: "a",
          createdAt: new Date("2026-11-25T00:00:00Z"),
        },
      ]),
    },
    notificationPreference: {
      findMany: vi.fn(async () =>
        state.prefs.length > 0
          ? state.prefs
          : [
              {
                userId: state.userId,
                type: "morning_brief",
                enabled: true,
                priority: "normal",
                dailySummaryTime: "07:00",
                quietHoursStart: "22:00",
                quietHoursEnd: "07:00",
                timezone: state.timezone,
                reminderMinutes: null,
              },
            ]
      ),
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
          for (const c of where.OR ?? []) {
            c.dedupKey?.in?.forEach((k) => keys.add(k));
            c.tag?.in?.forEach((k) => keys.add(k));
          }
          return (
            state.sent.find(
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
          state.sent.push(create);
          return create;
        }
      ),
      create: vi.fn(
        async ({
          data,
        }: {
          data: {
            userId: string;
            tag: string;
            dedupKey: string;
            type: string;
            sentAt: Date;
          };
        }) => {
          const exists = state.sent.find(
            (s) => s.userId === data.userId && s.dedupKey === data.dedupKey
          );
          if (exists) {
            throw Object.assign(new Error("Unique"), { code: "P2002" });
          }
          state.sent.push(data);
          return data;
        }
      ),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  },
}));

describe("Brief Scheduling Across Ticks, Timezones, and Missed Ticks (Step 8)", () => {
  beforeEach(() => {
    state.timezone = "Asia/Kathmandu";
    state.prefs = [];
    state.sent = [];
  });

  it("fires morning brief once when tick hits configured local time, never before or twice", async () => {
    const sendPush = vi.fn().mockResolvedValue(undefined);

    // 06:55 NPT = 01:10 UTC (5 mins before 07:00) -> should NOT fire
    const before = await withSimulatedTime("2026-11-25T01:10:00.000Z", () =>
      runNotificationScheduler(false, { only: "morning_brief", sendPush })
    );
    expect(before.sent).toBe(0);

    // 07:00 NPT = 01:15 UTC -> fires once
    const atTarget = await withSimulatedTime("2026-11-25T01:15:00.000Z", () =>
      runNotificationScheduler(false, { only: "morning_brief", sendPush })
    );
    expect(atTarget.sent).toBe(1);

    // 07:05 NPT = 01:20 UTC -> deduped
    const after = await withSimulatedTime("2026-11-25T01:20:00.000Z", () =>
      runNotificationScheduler(false, { only: "morning_brief", sendPush })
    );
    expect(after.sent).toBe(0);
    expect(sendPush).toHaveBeenCalledTimes(1);
  });

  it("recovers from a missed first tick within the 3-hour grace window, and skips after 3 hours", async () => {
    const sendPush = vi.fn().mockResolvedValue(undefined);

    // 10:05 NPT = 04:20 UTC (3h05m after 07:00) -> outside 3-hour grace window
    const tooLate = await withSimulatedTime("2026-11-25T04:20:00.000Z", () =>
      runNotificationScheduler(false, { only: "morning_brief", sendPush })
    );
    expect(tooLate.sent).toBe(0);

    // 08:25 NPT = 02:40 UTC (1h25m after 07:00, simulating missed 07:00..08:20 ticks) -> fires
    const recovered = await withSimulatedTime("2026-11-25T02:40:00.000Z", () =>
      runNotificationScheduler(false, { only: "morning_brief", sendPush })
    );
    expect(recovered.sent).toBe(1);
  });

  it("respects timezone changes", async () => {
    const sendPush = vi.fn().mockResolvedValue(undefined);
    state.timezone = "America/New_York"; // UTC-5 in late November

    // 07:00 NPT (01:15 UTC) is 20:15 previous day in New York -> should NOT fire
    const inNptOnly = await withSimulatedTime("2026-11-25T01:15:00.000Z", () =>
      runNotificationScheduler(false, { only: "morning_brief", sendPush })
    );
    expect(inNptOnly.sent).toBe(0);

    // 07:05 America/New_York = 12:05 UTC -> fires
    const inNy = await withSimulatedTime("2026-11-25T12:05:00.000Z", () =>
      runNotificationScheduler(false, { only: "morning_brief", sendPush })
    );
    expect(inNy.sent).toBe(1);
  });

  it("defers a brief configured inside quiet hours until quietHoursEnd and delivers once", async () => {
    const sendPush = vi.fn().mockResolvedValue(undefined);
    state.prefs = [
      {
        userId: state.userId,
        type: "morning_brief",
        enabled: true,
        priority: "normal",
        dailySummaryTime: "06:00", // inside 22:00–07:00
        quietHoursStart: "22:00",
        quietHoursEnd: "07:00",
        timezone: "Asia/Kathmandu",
        reminderMinutes: null,
      },
    ];

    // 06:05 NPT = 00:20 UTC -> deferred because 06:00 is inside quiet hours
    const atSix = await withSimulatedTime("2026-11-25T00:20:00.000Z", () =>
      runNotificationScheduler(false, { only: "morning_brief", sendPush })
    );
    expect(atSix.sent).toBe(0);

    // 07:00 NPT = 01:15 UTC -> quiet hours end -> delivers once
    const atQuietEnd = await withSimulatedTime("2026-11-25T01:15:00.000Z", () =>
      runNotificationScheduler(false, { only: "morning_brief", sendPush })
    );
    expect(atQuietEnd.sent).toBe(1);

    // 07:05 NPT -> never fires twice
    const repeat = await withSimulatedTime("2026-11-25T01:20:00.000Z", () =>
      runNotificationScheduler(false, { only: "morning_brief", sendPush })
    );
    expect(repeat.sent).toBe(0);
    expect(sendPush).toHaveBeenCalledTimes(1);
  });
});
