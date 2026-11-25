import { describe, it, expect, vi, beforeEach } from "vitest";
import { deriveSessionMetrics } from "../sessions";
import { upsertDsaSession } from "../session-actions";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/auth", () => ({
  getCurrentUserId: vi.fn(async () => "user-sess-1"),
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
    dsaSession: {
      upsert: vi.fn(),
    },
  },
}));

describe("DSA Daily Sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("derives counts and unique topics practised from linked attempts without storing them", () => {
    const derived = deriveSessionMetrics([
      { classification: "independent", topicName: "Arrays" },
      { classification: "effortful", topicName: "Arrays" },
      { classification: "hinted", topicName: "Sliding Window" },
      { classification: "editorial", topicName: "Graphs" },
      { classification: "not_understood", topicName: "Graphs" },
    ]);

    expect(derived).toEqual({
      attempted: 5,
      solvedIndependently: 1,
      needingHelp: 3, // effortful + hinted + editorial
      notUnderstood: 1,
      topicsPractised: ["Arrays", "Sliding Window", "Graphs"],
    });
  });

  it("allows creating or closing a session even with zero attempts (e.g. lectures only)", async () => {
    vi.mocked(prisma.dsaSession.upsert).mockResolvedValue({
      id: "sess-1",
      date: new Date("2026-11-25T00:00:00.000Z"),
      durationMin: 60,
    } as never);

    const res = await upsertDsaSession({
      date: "2026-11-25",
      durationMin: 60,
      observations: "Watched recursion lecture",
      nextSessionAvailabilityMin: 45,
      nextSessionNote: "Morning",
    });

    expect(res.ok).toBe(true);
    expect(prisma.dsaSession.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_date: {
            userId: "user-sess-1",
            date: new Date("2026-11-25T00:00:00.000Z"),
          },
        },
        create: expect.objectContaining({
          durationMin: 60,
          observations: "Watched recursion lecture",
          nextSessionAvailabilityMin: 45,
          nextSessionNote: "Morning",
        }),
      })
    );
  });
});
