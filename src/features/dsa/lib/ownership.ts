import { prisma } from "@/lib/prisma";
import { getCurrentUserId, UnauthorizedError } from "@/lib/auth";

/**
 * Resolves the authenticated user ID for DSA actions/queries.
 * Every DSA table is strictly user-scoped (no legacy null userId fallback).
 */
export async function requireDsaUserId(): Promise<string> {
  return getCurrentUserId();
}

/**
 * Returns a strict user ownership filter for DSA Prisma queries.
 */
export function dsaOwnerWhere(userId: string): { userId: string } {
  return { userId };
}

/**
 * Verifies that a DsaTopic exists and belongs to `userId`.
 * Throws UnauthorizedError otherwise.
 */
export async function assertDsaTopicOwner(userId: string, topicId: string) {
  const topic = await prisma.dsaTopic.findFirst({
    where: { id: topicId, userId },
  });
  if (!topic) {
    throw new UnauthorizedError("Topic not found or unauthorized");
  }
  return topic;
}

/**
 * Verifies that a DsaProblem exists and belongs to `userId`.
 * Throws UnauthorizedError otherwise.
 */
export async function assertDsaProblemOwner(userId: string, problemId: string) {
  const problem = await prisma.dsaProblem.findFirst({
    where: { id: problemId, userId },
  });
  if (!problem) {
    throw new UnauthorizedError("Problem not found or unauthorized");
  }
  return problem;
}

/**
 * Verifies that a DsaAttempt exists and belongs to `userId`.
 * Throws UnauthorizedError otherwise.
 */
export async function assertDsaAttemptOwner(userId: string, attemptId: string) {
  const attempt = await prisma.dsaAttempt.findFirst({
    where: { id: attemptId, userId },
  });
  if (!attempt) {
    throw new UnauthorizedError("Attempt not found or unauthorized");
  }
  return attempt;
}

/**
 * Verifies that a DsaSession exists and belongs to `userId`.
 * Throws UnauthorizedError otherwise.
 */
export async function assertDsaSessionOwner(userId: string, sessionId: string) {
  const session = await prisma.dsaSession.findFirst({
    where: { id: sessionId, userId },
  });
  if (!session) {
    throw new UnauthorizedError("Session not found or unauthorized");
  }
  return session;
}

/**
 * Verifies that a DsaContest exists and belongs to `userId`.
 * Throws UnauthorizedError otherwise.
 */
export async function assertDsaContestOwner(userId: string, contestId: string) {
  const contest = await prisma.dsaContest.findFirst({
    where: { id: contestId, userId },
  });
  if (!contest) {
    throw new UnauthorizedError("Contest not found or unauthorized");
  }
  return contest;
}
