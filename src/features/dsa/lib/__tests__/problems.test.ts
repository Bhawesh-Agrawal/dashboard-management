import { describe, it, expect, vi, beforeEach } from "vitest";
import { filterDsaProblems, type ProblemListItem } from "../problems";
import { setManualRevisionDate } from "../problem-actions";
import { prisma } from "@/lib/prisma";
import { UnauthorizedError } from "@/lib/auth";

vi.mock("@/lib/auth", () => ({
  getCurrentUserId: vi.fn(async () => "user-prob-1"),
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
    dsaProblem: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const sampleProblems: ProblemListItem[] = [
  {
    id: "p-1",
    topicId: "t-1",
    topicName: "Arrays",
    subtopic: "Basics",
    title: "Two Sum",
    difficulty: "easy",
    sourceUrl: "https://example.com/1",
    platform: "leetcode",
    platformId: "1",
    orderInTopic: 1,
    tags: ["hash"],
    archived: false,
    lastClassification: "independent",
    lastAttemptAt: "2026-11-20T10:00:00.000Z",
    intervalDays: 7,
    consecutiveIndependent: 1,
    nextRevisionDate: "2026-11-27",
    manualNextRevisionDate: null,
    effectiveRevisionDate: "2026-11-27",
    attemptCount: 1,
  },
  {
    id: "p-2",
    topicId: "t-1",
    topicName: "Arrays",
    subtopic: "Two Pointers",
    title: "3Sum",
    difficulty: "medium",
    sourceUrl: "",
    platform: "leetcode",
    platformId: "15",
    orderInTopic: 2,
    tags: ["two-pointers"],
    archived: false,
    lastClassification: "editorial",
    lastAttemptAt: "2026-11-23T10:00:00.000Z",
    intervalDays: 1,
    consecutiveIndependent: 0,
    nextRevisionDate: "2026-11-24",
    manualNextRevisionDate: null,
    effectiveRevisionDate: "2026-11-24",
    attemptCount: 1,
  },
  {
    id: "p-3",
    topicId: "t-2",
    topicName: "Graphs",
    subtopic: "BFS",
    title: "Word Ladder",
    difficulty: "hard",
    sourceUrl: "",
    platform: "other",
    platformId: null,
    orderInTopic: 1,
    tags: ["bfs"],
    archived: false,
    lastClassification: null,
    lastAttemptAt: null,
    intervalDays: null,
    consecutiveIndependent: 0,
    nextRevisionDate: null,
    manualNextRevisionDate: null,
    effectiveRevisionDate: null,
    attemptCount: 0,
  },
  {
    id: "p-arch",
    topicId: "t-1",
    topicName: "Arrays",
    subtopic: "Basics",
    title: "Archived Old Problem",
    difficulty: "easy",
    sourceUrl: "",
    platform: "",
    platformId: null,
    orderInTopic: 3,
    tags: [],
    archived: true,
    lastClassification: null,
    lastAttemptAt: null,
    intervalDays: null,
    consecutiveIndependent: 0,
    nextRevisionDate: null,
    manualNextRevisionDate: null,
    effectiveRevisionDate: null,
    attemptCount: 0,
  },
];

describe("DSA Problem Bank", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hides archived problems by default and filters by topic, query, status, difficulty, and revision due", () => {
    const todayStr = "2026-11-25";

    expect(filterDsaProblems(sampleProblems, { todayStr }).map((p) => p.id)).toEqual([
      "p-1",
      "p-2",
      "p-3",
    ]);

    expect(
      filterDsaProblems(sampleProblems, { todayStr, showArchived: true }).map((p) => p.id)
    ).toContain("p-arch");

    expect(
      filterDsaProblems(sampleProblems, { todayStr, topicId: "t-1", query: "sum" }).map(
        (p) => p.id
      )
    ).toEqual(["p-1", "p-2"]);

    expect(
      filterDsaProblems(sampleProblems, { todayStr, status: "not_attempted" }).map((p) => p.id)
    ).toEqual(["p-3"]);

    expect(
      filterDsaProblems(sampleProblems, { todayStr, revisionDue: "overdue" }).map((p) => p.id)
    ).toEqual(["p-2"]);

    expect(
      filterDsaProblems(sampleProblems, { todayStr, revisionDue: "next_7_days" }).map((p) => p.id)
    ).toEqual(["p-1"]);

    expect(
      filterDsaProblems(sampleProblems, { todayStr, revisionDue: "none" }).map((p) => p.id)
    ).toEqual(["p-3"]);
  });

  it("sets and clears manualNextRevisionDate with ownership check", async () => {
    vi.mocked(prisma.dsaProblem.findFirst).mockResolvedValueOnce({
      id: "11111111-1111-4111-8111-111111111111",
      userId: "user-prob-1",
    } as never);
    vi.mocked(prisma.dsaProblem.update).mockResolvedValueOnce({} as never);

    const res = await setManualRevisionDate({
      problemId: "11111111-1111-4111-8111-111111111111",
      manualNextRevisionDate: "2026-12-01",
    });
    expect(res.ok).toBe(true);
    expect(res.manualNextRevisionDate).toBe("2026-12-01");

    vi.mocked(prisma.dsaProblem.findFirst).mockResolvedValueOnce(null);
    await expect(
      setManualRevisionDate({
        problemId: "11111111-1111-4111-8111-111111111111",
        manualNextRevisionDate: null,
      })
    ).rejects.toThrow(UnauthorizedError);
  });
});
