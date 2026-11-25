import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDsaAttempt, updateDsaAttempt, deleteDsaAttempt } from "../attempt-actions";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/auth", () => ({
  getCurrentUserId: vi.fn(async () => "user-att-1"),
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

const mockTx = {
  dsaAttempt: {
    findFirst: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findMany: vi.fn(),
  },
  dsaSession: {
    upsert: vi.fn(),
  },
  dsaProblem: {
    update: vi.fn(),
  },
  dsaTopic: {
    updateMany: vi.fn(),
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dsaProblem: { findFirst: vi.fn() },
    dsaAttempt: { findFirst: vi.fn() },
    $transaction: vi.fn(async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
  },
}));

const PROBLEM_ID = "11111111-1111-4111-8111-111111111111";
const TOPIC_ID = "22222222-2222-4222-8222-222222222222";
const ATTEMPT_ID = "33333333-3333-4333-8333-333333333333";

describe("DSA Attempt Logging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates required vs optional fields", async () => {
    await expect(
      createDsaAttempt({
        problemId: PROBLEM_ID,
        classification: "independent",
        timeSpentMin: 0, // invalid (<1)
        confidence: 3,
      } as never)
    ).rejects.toThrow();

    await expect(
      createDsaAttempt({
        problemId: PROBLEM_ID,
        classification: "independent",
        timeSpentMin: 25,
        confidence: 6, // invalid (>5)
      } as never)
    ).rejects.toThrow();
  });

  it("creates attempt with only required fields, links session, recomputes state, clears manual override, and sets topic in_progress", async () => {
    vi.mocked(prisma.dsaProblem.findFirst).mockResolvedValue({
      id: PROBLEM_ID,
      userId: "user-att-1",
      topicId: TOPIC_ID,
      lastAttemptAt: null,
    } as never);
    mockTx.dsaAttempt.findFirst.mockResolvedValue(null);
    mockTx.dsaAttempt.count.mockResolvedValue(0);
    mockTx.dsaSession.upsert.mockResolvedValue({ id: "sess-1" });
    mockTx.dsaAttempt.create.mockResolvedValue({ id: ATTEMPT_ID, isRevision: false });
    mockTx.dsaAttempt.findMany.mockResolvedValue([
      {
        attemptedAt: new Date("2026-11-25T10:00:00.000Z"),
        attemptDate: new Date("2026-11-25T00:00:00.000Z"),
        classification: "independent",
      },
    ]);

    const res = await createDsaAttempt({
      problemId: PROBLEM_ID,
      attemptDate: "2026-11-25",
      classification: "independent",
      timeSpentMin: 25,
      confidence: 4,
      helpType: "none",
      mistakeTags: [],
      clientRequestId: "req-1",
    });

    expect(res.ok).toBe(true);
    expect(res.deduplicated).toBe(false);
    expect(mockTx.dsaAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isRevision: false,
          sessionId: "sess-1",
          clientRequestId: "req-1",
        }),
      })
    );
    expect(mockTx.dsaProblem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastClassification: "independent",
          intervalDays: 7,
          consecutiveIndependent: 1,
          manualNextRevisionDate: null,
        }),
      })
    );
    expect(mockTx.dsaTopic.updateMany).toHaveBeenCalledWith({
      where: { id: TOPIC_ID, userId: "user-att-1", status: "not_started" },
      data: { status: "in_progress" },
    });
  });

  it("preserves append-only history across multiple attempts and auto-sets isRevision=true", async () => {
    vi.mocked(prisma.dsaProblem.findFirst).mockResolvedValue({
      id: PROBLEM_ID,
      userId: "user-att-1",
      topicId: TOPIC_ID,
      lastAttemptAt: new Date("2026-11-20T10:00:00.000Z"),
    } as never);
    mockTx.dsaAttempt.findFirst.mockResolvedValue(null);
    mockTx.dsaAttempt.count.mockResolvedValue(1);
    mockTx.dsaSession.upsert.mockResolvedValue({ id: "sess-2" });
    mockTx.dsaAttempt.create.mockResolvedValue({ id: "att-2", isRevision: true });
    mockTx.dsaAttempt.findMany.mockResolvedValue([
      {
        attemptedAt: new Date("2026-11-20T10:00:00.000Z"),
        attemptDate: new Date("2026-11-20T00:00:00.000Z"),
        classification: "independent",
      },
      {
        attemptedAt: new Date("2026-11-25T10:00:00.000Z"),
        attemptDate: new Date("2026-11-25T00:00:00.000Z"),
        classification: "independent",
      },
    ]);

    await createDsaAttempt({
      problemId: PROBLEM_ID,
      attemptDate: "2026-11-25",
      classification: "independent",
      timeSpentMin: 15,
      confidence: 5,
      helpType: "none",
      mistakeTags: [],
    });

    expect(mockTx.dsaAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isRevision: true }),
      })
    );
    expect(mockTx.dsaProblem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          consecutiveIndependent: 2,
          intervalDays: 14,
        }),
      })
    );
  });

  it("is retry-safe: duplicate clientRequestId returns existing attempt without creating duplicate", async () => {
    vi.mocked(prisma.dsaProblem.findFirst).mockResolvedValue({
      id: PROBLEM_ID,
      userId: "user-att-1",
      topicId: TOPIC_ID,
      lastAttemptAt: null,
    } as never);
    mockTx.dsaAttempt.findFirst.mockResolvedValue({ id: ATTEMPT_ID, clientRequestId: "same-key" });

    const res = await createDsaAttempt({
      problemId: PROBLEM_ID,
      attemptDate: "2026-11-25",
      classification: "hinted",
      timeSpentMin: 30,
      confidence: 3,
      helpType: "small_hint",
      mistakeTags: [],
      clientRequestId: "same-key",
    });

    expect(res.ok).toBe(true);
    expect(res.deduplicated).toBe(true);
    expect(mockTx.dsaAttempt.create).not.toHaveBeenCalled();
  });

  it("recomputes problem state when explicitly editing or deleting an attempt", async () => {
    vi.mocked(prisma.dsaAttempt.findFirst).mockResolvedValue({
      id: ATTEMPT_ID,
      userId: "user-att-1",
      problemId: PROBLEM_ID,
      attemptedAt: new Date("2026-11-25T10:00:00.000Z"),
      attemptDate: new Date("2026-11-25T00:00:00.000Z"),
    } as never);
    mockTx.dsaSession.upsert.mockResolvedValue({ id: "sess-1" });
    mockTx.dsaAttempt.update.mockResolvedValue({ id: ATTEMPT_ID });
    mockTx.dsaAttempt.findMany.mockResolvedValue([
      {
        attemptedAt: new Date("2026-11-25T10:00:00.000Z"),
        attemptDate: new Date("2026-11-25T00:00:00.000Z"),
        classification: "editorial",
      },
    ]);

    await updateDsaAttempt({
      attemptId: ATTEMPT_ID,
      attemptDate: "2026-11-25",
      classification: "editorial",
      timeSpentMin: 45,
      confidence: 2,
      isRevision: false,
      helpType: "editorial",
      mistakeTags: ["missed pattern"],
    });

    expect(mockTx.dsaProblem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastClassification: "editorial",
          intervalDays: 1,
          consecutiveIndependent: 0,
        }),
      })
    );

    mockTx.dsaAttempt.findMany.mockResolvedValue([]);
    await deleteDsaAttempt({ attemptId: ATTEMPT_ID });
    expect(mockTx.dsaAttempt.delete).toHaveBeenCalledWith({ where: { id: ATTEMPT_ID } });
    expect(mockTx.dsaProblem.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastClassification: null,
          nextRevisionDate: null,
          manualNextRevisionDate: null,
        }),
      })
    );
  });
});
