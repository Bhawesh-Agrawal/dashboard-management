import { describe, it, expect, vi, beforeEach } from "vitest";
import { exportDsaBackup, restoreDsaBackup } from "../backup-actions";
import { validateBackupPayload } from "../backup-schema";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/auth", () => ({
  getCurrentUserId: vi.fn(async () => "user-bkp-1"),
  UnauthorizedError: class UnauthorizedError extends Error {
    constructor(msg = "Unauthorized") {
      super(msg);
      this.name = "UnauthorizedError";
    }
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Stateful in-memory DB mock for true export -> wipe -> restore round-trip and merge idempotency
const store = {
  settings: null as Record<string, unknown> | null,
  topics: new Map<string, Record<string, unknown>>(),
  problems: new Map<string, Record<string, unknown>>(),
  attempts: new Map<string, Record<string, unknown>>(),
  sessions: new Map<string, Record<string, unknown>>(),
  contests: new Map<string, Record<string, unknown>>(),
};

function resetStore() {
  store.settings = null;
  store.topics.clear();
  store.problems.clear();
  store.attempts.clear();
  store.sessions.clear();
  store.contests.clear();
}

const mockTx = {
  dsaAttempt: {
    deleteMany: vi.fn(async () => {
      store.attempts.clear();
    }),
    createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
      for (const row of data) store.attempts.set(String(row.id), row);
    }),
    findFirst: vi.fn(async ({ where }: { where: { id: string } }) =>
      store.attempts.get(where.id) ?? null
    ),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const prev = store.attempts.get(where.id) ?? {};
      store.attempts.set(where.id, { ...prev, ...data, id: where.id });
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      store.attempts.set(String(data.id), data);
      return data;
    }),
  },
  dsaProblem: {
    deleteMany: vi.fn(async () => {
      store.problems.clear();
    }),
    createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
      for (const row of data) store.problems.set(String(row.id), row);
    }),
    findFirst: vi.fn(async ({ where }: { where: { id: string } }) =>
      store.problems.get(where.id) ?? null
    ),
    findUnique: vi.fn(async ({ where }: { where: { userId_importKey: { importKey: string } } }) => {
      for (const row of store.problems.values()) {
        if (row.importKey === where.userId_importKey.importKey) return row;
      }
      return null;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const prev = store.problems.get(where.id) ?? {};
      store.problems.set(where.id, { ...prev, ...data, id: where.id });
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      store.problems.set(String(data.id), data);
      return data;
    }),
  },
  dsaTopic: {
    deleteMany: vi.fn(async () => {
      store.topics.clear();
    }),
    createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
      for (const row of data) store.topics.set(String(row.id), row);
    }),
    findFirst: vi.fn(async ({ where }: { where: { id: string } }) =>
      store.topics.get(where.id) ?? null
    ),
    findUnique: vi.fn(async ({ where }: { where: { userId_name: { name: string } } }) => {
      for (const row of store.topics.values()) {
        if (row.name === where.userId_name.name) return row;
      }
      return null;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const prev = store.topics.get(where.id) ?? {};
      store.topics.set(where.id, { ...prev, ...data, id: where.id });
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      store.topics.set(String(data.id), data);
      return data;
    }),
  },
  dsaSession: {
    deleteMany: vi.fn(async () => {
      store.sessions.clear();
    }),
    createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
      for (const row of data) store.sessions.set(String(row.id), row);
    }),
    findFirst: vi.fn(async ({ where }: { where: { id: string } }) =>
      store.sessions.get(where.id) ?? null
    ),
    findUnique: vi.fn(async ({ where }: { where: { userId_date: { date: Date } } }) => {
      const target = where.userId_date.date.toISOString();
      for (const row of store.sessions.values()) {
        if ((row.date as Date).toISOString() === target) return row;
      }
      return null;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const prev = store.sessions.get(where.id) ?? {};
      store.sessions.set(where.id, { ...prev, ...data, id: where.id });
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      store.sessions.set(String(data.id), data);
      return data;
    }),
  },
  dsaContest: {
    deleteMany: vi.fn(async () => {
      store.contests.clear();
    }),
    createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
      for (const row of data) store.contests.set(String(row.id), row);
    }),
    findFirst: vi.fn(async ({ where }: { where: { id: string } }) =>
      store.contests.get(where.id) ?? null
    ),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const prev = store.contests.get(where.id) ?? {};
      store.contests.set(where.id, { ...prev, ...data, id: where.id });
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      store.contests.set(String(data.id), data);
      return data;
    }),
  },
  dsaSettings: {
    deleteMany: vi.fn(async () => {
      store.settings = null;
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      store.settings = data;
      return data;
    }),
    upsert: vi.fn(async ({ update, create }: { update: Record<string, unknown>; create: Record<string, unknown> }) => {
      store.settings = store.settings ? { ...store.settings, ...update } : create;
      return store.settings;
    }),
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dsaSettings: {
      upsert: vi.fn(async ({ update, create }: { update: Record<string, unknown>; create: Record<string, unknown> }) => {
        store.settings = store.settings ? { ...store.settings, ...update } : create;
        return store.settings;
      }),
    },
    dsaTopic: { findMany: vi.fn(async () => Array.from(store.topics.values())) },
    dsaProblem: { findMany: vi.fn(async () => Array.from(store.problems.values())) },
    dsaAttempt: { findMany: vi.fn(async () => Array.from(store.attempts.values())) },
    dsaSession: { findMany: vi.fn(async () => Array.from(store.sessions.values())) },
    dsaContest: { findMany: vi.fn(async () => Array.from(store.contests.values())) },
    $transaction: vi.fn(async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
  },
}));

const T_ID = "11111111-1111-4111-8111-111111111111";
const P_ID = "22222222-2222-4222-8222-222222222222";
const S_ID = "33333333-3333-4333-8333-333333333333";
const A_ID = "44444444-4444-4444-8444-444444444444";
const C_ID = "55555555-5555-4555-8555-555555555555";
const SET_ID = "66666666-6666-4666-8666-666666666666";

function seedStore() {
  store.settings = {
    id: SET_ID,
    userId: "user-bkp-1",
    programmeStartDate: new Date("2026-11-01T00:00:00.000Z"),
    programmeLengthDays: 90,
    phases: [{ name: "Phase 1", startDay: 1 }],
    currentTopicId: T_ID,
    lastBackupAt: null,
  };
  store.topics.set(T_ID, {
    id: T_ID,
    userId: "user-bkp-1",
    name: "Arrays",
    order: 1,
    status: "in_progress",
  });
  store.sessions.set(S_ID, {
    id: S_ID,
    userId: "user-bkp-1",
    date: new Date("2026-11-25T00:00:00.000Z"),
    durationMin: 45,
    observations: "Focused",
    nextSessionAvailabilityMin: 60,
    nextSessionNote: "Morning",
  });
  store.problems.set(P_ID, {
    id: P_ID,
    userId: "user-bkp-1",
    topicId: T_ID,
    subtopic: "Hashing",
    title: "Two Sum",
    difficulty: "easy",
    sourceUrl: "https://example.com/1",
    platform: "leetcode",
    platformId: "1",
    orderInTopic: 1,
    tags: ["hash"],
    importKey: "leetcode:1",
    archived: false,
    lastClassification: "independent",
    lastAttemptAt: new Date("2026-11-25T10:00:00.000Z"),
    intervalDays: 7,
    consecutiveIndependent: 1,
    nextRevisionDate: new Date("2026-12-02T00:00:00.000Z"),
    manualNextRevisionDate: null,
  });
  store.attempts.set(A_ID, {
    id: A_ID,
    userId: "user-bkp-1",
    problemId: P_ID,
    attemptedAt: new Date("2026-11-25T10:00:00.000Z"),
    attemptDate: new Date("2026-11-25T00:00:00.000Z"),
    classification: "independent",
    timeSpentMin: 20,
    confidence: 4,
    isRevision: false,
    helpType: "none",
    initialApproach: null,
    finalApproach: "Hash map",
    mistakes: null,
    mistakeTags: [],
    timeComplexity: "O(n)",
    spaceComplexity: "O(n)",
    observation: null,
    sessionId: S_ID,
    clientRequestId: "req-1",
  });
  store.contests.set(C_ID, {
    id: C_ID,
    userId: "user-bkp-1",
    platform: "leetcode",
    name: "Weekly 420",
    date: new Date("2026-11-24T00:00:00.000Z"),
    problemsAttempted: 4,
    problemsSolved: 2,
    rankOrRating: "1600",
    upsolveProblems: "Q3",
    conceptsMissed: "DP",
  });
}

describe("DSA Backup and Restore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it("round-trips export -> wipe -> replace restore with identical data and preserved IDs", async () => {
    seedStore();
    const firstExport = await exportDsaBackup();
    expect(firstExport.ok).toBe(true);
    expect(firstExport.backup.data.topics).toHaveLength(1);
    expect(firstExport.backup.data.problems[0].id).toBe(P_ID);

    // Wipe DB
    resetStore();
    expect(store.problems.size).toBe(0);

    // Restore via replace
    const restoreRes = await restoreDsaBackup({
      rawPayload: firstExport.backup,
      mode: "replace",
      confirmationText: "REPLACE",
    });
    expect(restoreRes.ok).toBe(true);

    const secondExport = await exportDsaBackup();
    expect(secondExport.backup.data).toEqual({
      ...firstExport.backup.data,
      settings: {
        ...firstExport.backup.data.settings,
        // second export updates lastBackupAt
        lastBackupAt: secondExport.backup.data.settings?.lastBackupAt,
      },
    });
    expect(store.topics.get(T_ID)?.id).toBe(T_ID);
    expect(store.problems.get(P_ID)?.id).toBe(P_ID);
    expect(store.attempts.get(A_ID)?.id).toBe(A_ID);
  });

  it("merging twice is idempotent", async () => {
    seedStore();
    const { backup } = await exportDsaBackup();

    const r1 = await restoreDsaBackup({ rawPayload: backup, mode: "merge" });
    const r2 = await restoreDsaBackup({ rawPayload: backup, mode: "merge" });

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(store.topics.size).toBe(1);
    expect(store.problems.size).toBe(1);
    expect(store.attempts.size).toBe(1);
    expect(store.sessions.size).toBe(1);
    expect(store.contests.size).toBe(1);
  });

  it("rejects invalid backup files and unconfirmed replace without partial writes", async () => {
    seedStore();

    // Invalid schemaVersion
    const badCheck = validateBackupPayload({ schemaVersion: "99.0", data: {} });
    expect(badCheck.ok).toBe(false);

    // Broken FK reference
    const brokenFk = validateBackupPayload({
      schemaVersion: "1.0.0",
      exportedAt: "2026-11-25T10:00:00.000Z",
      data: {
        settings: null,
        topics: [],
        problems: [
          {
            id: P_ID,
            topicId: T_ID, // missing from topics!
            subtopic: "",
            title: "Orphan",
            difficulty: null,
            sourceUrl: "",
            platform: "",
            platformId: null,
            orderInTopic: 1,
            tags: [],
            importKey: "orphan|orphan",
            archived: false,
            lastClassification: null,
            lastAttemptAt: null,
            intervalDays: null,
            consecutiveIndependent: 0,
            nextRevisionDate: null,
            manualNextRevisionDate: null,
          },
        ],
        attempts: [],
        sessions: [],
        contests: [],
      },
    });
    expect(brokenFk.ok).toBe(false);

    const resBad = await restoreDsaBackup({
      rawPayload: { schemaVersion: "bad" },
      mode: "merge",
    });
    expect(resBad.ok).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();

    const resUnconfirmed = await restoreDsaBackup({
      rawPayload: (await exportDsaBackup()).backup,
      mode: "replace",
      confirmationText: "wrong",
    });
    expect(resUnconfirmed.ok).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
