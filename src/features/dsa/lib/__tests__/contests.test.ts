import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDsaContest, updateDsaContest, deleteDsaContest } from "../contest-actions";
import { prisma } from "@/lib/prisma";
import { UnauthorizedError } from "@/lib/auth";

vi.mock("@/lib/auth", () => ({
  getCurrentUserId: vi.fn(async () => "user-contest-1"),
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
    dsaContest: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

const C_ID = "11111111-1111-4111-8111-111111111111";

describe("DSA Contests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects solved > attempted and creates valid contest entries", async () => {
    await expect(
      createDsaContest({
        platform: "leetcode",
        name: "Weekly 420",
        date: "2026-11-24",
        problemsAttempted: 2,
        problemsSolved: 3,
      })
    ).rejects.toThrow();

    vi.mocked(prisma.dsaContest.create).mockResolvedValue({ id: C_ID } as never);
    const res = await createDsaContest({
      platform: "codechef",
      name: "Starters 160",
      date: "2026-11-24",
      problemsAttempted: 4,
      problemsSolved: 2,
      rankOrRating: "1620",
      upsolveProblems: "P3",
      conceptsMissed: "Segment trees",
    });

    expect(res.ok).toBe(true);
    expect(prisma.dsaContest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-contest-1",
          platform: "codechef",
          problemsSolved: 2,
        }),
      })
    );
  });

  it("enforces ownership on update and delete", async () => {
    vi.mocked(prisma.dsaContest.findFirst).mockResolvedValue(null);
    await expect(
      updateDsaContest({
        id: C_ID,
        platform: "other",
        name: "Test",
        date: "2026-11-24",
        problemsAttempted: 2,
        problemsSolved: 1,
      })
    ).rejects.toThrow(UnauthorizedError);

    await expect(deleteDsaContest({ id: C_ID })).rejects.toThrow(UnauthorizedError);
  });
});
