import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  requireDsaUserId,
  dsaOwnerWhere,
  assertDsaTopicOwner,
  assertDsaProblemOwner,
  assertDsaAttemptOwner,
  assertDsaSessionOwner,
  assertDsaContestOwner,
} from "../ownership";
import { prisma } from "@/lib/prisma";
import { UnauthorizedError, getCurrentUserId } from "@/lib/auth";

vi.mock("@/lib/auth", () => ({
  getCurrentUserId: vi.fn(async () => "user-dsa-1"),
  UnauthorizedError: class UnauthorizedError extends Error {
    constructor(msg = "Unauthorized") {
      super(msg);
      this.name = "UnauthorizedError";
    }
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dsaTopic: { findFirst: vi.fn() },
    dsaProblem: { findFirst: vi.fn() },
    dsaAttempt: { findFirst: vi.fn() },
    dsaSession: { findFirst: vi.fn() },
    dsaContest: { findFirst: vi.fn() },
  },
}));

describe("DSA Ownership Helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requireDsaUserId delegates to getCurrentUserId", async () => {
    const uid = await requireDsaUserId();
    expect(uid).toBe("user-dsa-1");
    expect(getCurrentUserId).toHaveBeenCalledTimes(1);
  });

  it("dsaOwnerWhere strictly scopes to userId without null fallback", () => {
    expect(dsaOwnerWhere("user-dsa-1")).toEqual({ userId: "user-dsa-1" });
  });

  it("rejects unauthorized topic, problem, attempt, session, and contest lookups", async () => {
    vi.mocked(prisma.dsaTopic.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.dsaProblem.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.dsaAttempt.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.dsaSession.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.dsaContest.findFirst).mockResolvedValue(null);

    await expect(assertDsaTopicOwner("user-dsa-1", "t-other")).rejects.toThrow(UnauthorizedError);
    await expect(assertDsaProblemOwner("user-dsa-1", "p-other")).rejects.toThrow(UnauthorizedError);
    await expect(assertDsaAttemptOwner("user-dsa-1", "a-other")).rejects.toThrow(UnauthorizedError);
    await expect(assertDsaSessionOwner("user-dsa-1", "s-other")).rejects.toThrow(UnauthorizedError);
    await expect(assertDsaContestOwner("user-dsa-1", "c-other")).rejects.toThrow(UnauthorizedError);

    expect(prisma.dsaTopic.findFirst).toHaveBeenCalledWith({
      where: { id: "t-other", userId: "user-dsa-1" },
    });
    expect(prisma.dsaProblem.findFirst).toHaveBeenCalledWith({
      where: { id: "p-other", userId: "user-dsa-1" },
    });
    expect(prisma.dsaAttempt.findFirst).toHaveBeenCalledWith({
      where: { id: "a-other", userId: "user-dsa-1" },
    });
    expect(prisma.dsaSession.findFirst).toHaveBeenCalledWith({
      where: { id: "s-other", userId: "user-dsa-1" },
    });
    expect(prisma.dsaContest.findFirst).toHaveBeenCalledWith({
      where: { id: "c-other", userId: "user-dsa-1" },
    });
  });

  it("returns owned entity when userId matches", async () => {
    const ownedTopic = { id: "t-1", userId: "user-dsa-1", name: "Arrays" };
    vi.mocked(prisma.dsaTopic.findFirst).mockResolvedValue(ownedTopic as never);

    const res = await assertDsaTopicOwner("user-dsa-1", "t-1");
    expect(res).toEqual(ownedTopic);
  });
});
