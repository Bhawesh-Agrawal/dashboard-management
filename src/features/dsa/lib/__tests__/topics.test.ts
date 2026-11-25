import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeTopicsOverview } from "../topics";
import { updateDsaTopicStatus, setDsaCurrentTopic } from "../topic-actions";
import { prisma } from "@/lib/prisma";
import { UnauthorizedError } from "@/lib/auth";

vi.mock("@/lib/auth", () => ({
  getCurrentUserId: vi.fn(async () => "user-topics-1"),
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

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dsaTopic: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    dsaSettings: {
      upsert: vi.fn(),
    },
  },
}));

describe("DSA Topic Tracker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("computes summary counts (covered = practised + needs_revision + comfortable), classification counts, overdue, and readiness evidence", () => {
    const res = computeTopicsOverview({
      topics: [
        { id: "t1", name: "Arrays", order: 1, status: "practised" },
        { id: "t2", name: "DP", order: 2, status: "needs_revision" },
        { id: "t3", name: "Graphs", order: 3, status: "comfortable" },
        { id: "t4", name: "Trees", order: 4, status: "in_progress" },
        { id: "t5", name: "Tries", order: 5, status: "not_started" },
      ],
      problems: [
        {
          id: "p1",
          topicId: "t1",
          archived: false,
          lastClassification: "independent",
          nextRevisionDate: "2026-11-20",
          manualNextRevisionDate: null,
        },
        {
          id: "p2",
          topicId: "t1",
          archived: false,
          lastClassification: "editorial",
          nextRevisionDate: "2026-11-26",
          manualNextRevisionDate: "2026-11-24", // manual override is overdue vs 2026-11-25
        },
        {
          id: "p3",
          topicId: "t1",
          archived: false,
          lastClassification: null,
          nextRevisionDate: null,
          manualNextRevisionDate: null,
        },
        {
          id: "p-archived",
          topicId: "t1",
          archived: true,
          lastClassification: "not_understood",
          nextRevisionDate: "2026-11-01",
          manualNextRevisionDate: null,
        },
      ],
      recentFailedProblemIds: new Set(["p2"]),
      currentTopicId: "t4",
      todayStr: "2026-11-25",
    });

    expect(res.summary).toEqual({
      total: 5,
      covered: 3, // practised + needs_revision + comfortable
      inProgress: 1,
      remaining: 1,
    });

    const arrays = res.topics[0];
    expect(arrays.totalProblems).toBe(3); // excludes archived
    expect(arrays.attemptedProblems).toBe(2);
    expect(arrays.overdueCount).toBe(2);
    expect(arrays.classificationCounts).toEqual({
      independent: 1,
      effortful: 0,
      hinted: 0,
      editorial: 1,
      not_understood: 0,
    });
    expect(arrays.readinessEvidence).toEqual({
      independentPercent: 50,
      failuresLast14Days: 1,
      overdueCount: 2,
    });
    expect(res.topics[3].isCurrent).toBe(true);
  });

  it("allows manual transition to any status and rejects unauthorized topic edits", async () => {
    vi.mocked(prisma.dsaTopic.findFirst).mockResolvedValueOnce({
      id: "11111111-1111-4111-8111-111111111111",
      userId: "user-topics-1",
    } as never);
    vi.mocked(prisma.dsaTopic.update).mockResolvedValueOnce({
      id: "11111111-1111-4111-8111-111111111111",
      status: "comfortable",
    } as never);

    const res = await updateDsaTopicStatus({
      topicId: "11111111-1111-4111-8111-111111111111",
      status: "comfortable",
    });
    expect(res.ok).toBe(true);

    vi.mocked(prisma.dsaTopic.findFirst).mockResolvedValueOnce(null);
    await expect(
      updateDsaTopicStatus({
        topicId: "11111111-1111-4111-8111-111111111111",
        status: "not_started",
      })
    ).rejects.toThrow(UnauthorizedError);
  });

  it("sets current topic in DsaSettings", async () => {
    vi.mocked(prisma.dsaTopic.findFirst).mockResolvedValueOnce({
      id: "11111111-1111-4111-8111-111111111111",
      userId: "user-topics-1",
    } as never);
    vi.mocked(prisma.dsaSettings.upsert).mockResolvedValueOnce({} as never);

    const res = await setDsaCurrentTopic({
      topicId: "11111111-1111-4111-8111-111111111111",
    });
    expect(res.ok).toBe(true);
    expect(res.currentTopicId).toBe("11111111-1111-4111-8111-111111111111");
  });
});
