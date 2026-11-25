import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildDedupKey,
  dispatchNotifications,
  type NotificationCandidate,
} from "../engine";

const state = {
  sent: [] as Array<{
    userId: string;
    tag: string;
    dedupKey: string | null;
    type: string;
    sentAt: Date;
    snoozedUntil: Date | null;
  }>,
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
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
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
          where,
          create,
        }: {
          where: { userId_dedupKey: { userId: string; dedupKey: string } };
          create: {
            userId: string;
            tag: string;
            dedupKey: string;
            type: string;
            sentAt: Date;
          };
        }) => {
          const existing = state.sent.find(
            (s) =>
              s.userId === where.userId_dedupKey.userId &&
              s.dedupKey === where.userId_dedupKey.dedupKey
          );
          if (!existing) {
            state.sent.push({
              ...create,
              snoozedUntil: null,
            });
          }
          return existing ?? create;
        }
      ),
    },
    notificationPreference: {
      findMany: vi.fn(async ({ where }: { where: { userId: string } }) =>
        state.prefs.filter((p) => p.userId === where.userId)
      ),
    },
    pushSubscription: {
      findMany: vi.fn(async ({ where }: { where: { userId: string } }) =>
        state.subs.filter((s) => s.userId === where.userId)
      ),
      deleteMany: vi.fn(async ({ where }: { where: { endpoint: string } }) => {
        const before = state.subs.length;
        state.subs = state.subs.filter((s) => s.endpoint !== where.endpoint);
        return { count: before - state.subs.length };
      }),
    },
  },
}));

describe("Notification Engine (dispatchNotifications)", () => {
  beforeEach(() => {
    state.sent = [];
    state.prefs = [];
    state.subs = [
      {
        id: "sub-phone",
        userId: "u1",
        endpoint: "https://push.example/phone",
        p256dh: "k1",
        auth: "a1",
        createdAt: new Date("2026-11-25T00:00:00Z"),
      },
      {
        id: "sub-laptop",
        userId: "u1",
        endpoint: "https://push.example/laptop",
        p256dh: "k2",
        auth: "a2",
        createdAt: new Date("2026-11-25T01:00:00Z"),
      },
    ];
  });

  it("delivers once to all user subscriptions and deduplicates subsequent runs", async () => {
    const sendPush = vi.fn().mockResolvedValue(undefined);
    const now = new Date("2026-11-25T04:00:00Z"); // 09:45 Asia/Kathmandu
    const dedupKey = buildDedupKey("class_start", "sched-1", "2026-11-25");

    const candidate: NotificationCandidate = {
      userId: "u1",
      type: "class_start",
      entityId: "sched-1",
      occurrenceDate: "2026-11-25",
      scheduledFor: now,
      dedupKey,
      title: "Class Starting Soon",
      body: "Algorithms at 10:00",
      url: "/courses/c1",
    };

    const first = await dispatchNotifications([candidate], { now, sendPush });
    expect(first.sent).toBe(1);
    expect(first.deliveredPushes).toBe(2);
    expect(sendPush).toHaveBeenCalledTimes(2);

    const second = await dispatchNotifications([candidate], { now, sendPush });
    expect(second.sent).toBe(0);
    expect(second.skippedDedup).toBe(1);
    expect(sendPush).toHaveBeenCalledTimes(2);
  });

  it("records coveredItems dedupKeys when dispatching a digest so individual items never fire twice", async () => {
    const sendPush = vi.fn().mockResolvedValue(undefined);
    const now = new Date("2026-11-25T04:00:00Z");

    const item1Key = buildDedupKey("class_start", "sched-1", "2026-11-25");
    const item2Key = buildDedupKey("class_start", "sched-2", "2026-11-25");
    const digestKey = buildDedupKey("class_start", "digest-1", "2026-11-25");

    const digestCandidate: NotificationCandidate = {
      userId: "u1",
      type: "class_start",
      entityId: "digest-1",
      occurrenceDate: "2026-11-25",
      scheduledFor: now,
      dedupKey: digestKey,
      title: "2 upcoming classes",
      body: "Algorithms and Systems",
      url: "/brief",
      coveredItems: [
        { dedupKey: item1Key, type: "class_start" },
        { dedupKey: item2Key, type: "class_start" },
      ],
    };

    await dispatchNotifications([digestCandidate], { now, sendPush });
    expect(sendPush).toHaveBeenCalledTimes(2);

    const individual1: NotificationCandidate = {
      userId: "u1",
      type: "class_start",
      entityId: "sched-1",
      occurrenceDate: "2026-11-25",
      scheduledFor: now,
      dedupKey: item1Key,
      title: "Class Starting Soon",
      body: "Algorithms",
      url: "/courses/c1",
    };

    const individual2: NotificationCandidate = {
      ...individual1,
      entityId: "sched-2",
      dedupKey: item2Key,
    };

    const followUp = await dispatchNotifications([individual1, individual2], {
      now,
      sendPush,
    });
    expect(followUp.sent).toBe(0);
    expect(followUp.skippedDedup).toBe(2);
    expect(sendPush).toHaveBeenCalledTimes(2);
  });

  it("removes dead subscriptions on 410 and keeps healthy ones", async () => {
    const sendPush = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("Gone"), { statusCode: 410 }))
      .mockResolvedValueOnce(undefined);

    const now = new Date("2026-11-25T04:00:00Z");
    const candidate: NotificationCandidate = {
      userId: "u1",
      type: "class_start",
      entityId: "sched-9",
      occurrenceDate: "2026-11-25",
      scheduledFor: now,
      dedupKey: buildDedupKey("class_start", "sched-9", "2026-11-25"),
      title: "Class Starting Soon",
      body: "OS at 10:00",
      url: "/courses/c2",
    };

    const res = await dispatchNotifications([candidate], { now, sendPush });
    expect(res.removedSubscriptions).toBe(1);
    expect(res.deliveredPushes).toBe(1);
    expect(res.sent).toBe(1);
    expect(state.subs).toHaveLength(1);
    expect(state.subs[0].endpoint).toBe("https://push.example/laptop");
  });
});
