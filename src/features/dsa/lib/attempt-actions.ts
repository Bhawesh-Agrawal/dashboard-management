"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getNow } from "@/lib/clock";
import {
  assertDsaAttemptOwner,
  assertDsaProblemOwner,
  requireDsaUserId,
} from "./ownership";
import {
  DsaCreateAttemptSchema,
  DsaUpdateAttemptSchema,
} from "./schemas";
import { recomputeProblemState } from "./revision";
import { getUserTimezone } from "@/lib/timezone-server";
import { dsaParseDate, dsaToday } from "./time";

const DeleteAttemptSchema = z.object({
  attemptId: z.string().uuid(),
});

function revalidateDsaAttemptPaths(problemId: string) {
  revalidatePath("/dsa");
  revalidatePath("/dsa/topics");
  revalidatePath("/dsa/problems");
  revalidatePath(`/dsa/problems/${problemId}`);
  revalidatePath("/dsa/revision");
  revalidatePath("/dsa/log");
  revalidatePath("/dsa/report");
  revalidatePath("/today");
}

function cleanOptionalText(val: string | null | undefined): string | null {
  if (val == null) return null;
  const trimmed = val.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Logs an attempt transactionally:
 * 1. Idempotency check via clientRequestId
 * 2. Upsert/link DsaSession for attemptDate
 * 3. Insert DsaAttempt
 * 4. Recompute DsaProblem progress state from chronological attempt history
 * 5. Clear manualNextRevisionDate when newer attempt is logged
 * 6. Transition topic status not_started -> in_progress (never auto-sets comfortable)
 */
export async function createDsaAttempt(
  input: z.infer<typeof DsaCreateAttemptSchema>
) {
  const validated = DsaCreateAttemptSchema.parse(input);
  const userId = await requireDsaUserId();
  const problem = await assertDsaProblemOwner(userId, validated.problemId);

  const now = getNow();
  const tz = await getUserTimezone();
  const attemptDateStr = validated.attemptDate ?? dsaToday(now, tz);
  const attemptDateObj = dsaParseDate(attemptDateStr);

  // Align attemptedAt with attemptDate if backdated so chronological replay respects backdated dates
  const todayStr = dsaToday(now, tz);
  const attemptedAt =
    attemptDateStr === todayStr
      ? now
      : new Date(`${attemptDateStr}T12:00:00.000Z`);

  const result = await prisma.$transaction(
    async (tx) => {
      if (validated.clientRequestId) {
        const existing = await tx.dsaAttempt.findFirst({
          where: { userId, clientRequestId: validated.clientRequestId },
        });
        if (existing) {
          return { attempt: existing, deduplicated: true };
        }
      }

      const existingCount = await tx.dsaAttempt.count({
        where: { userId, problemId: problem.id },
      });

      const isRevision =
        validated.isRevision !== undefined ? validated.isRevision : existingCount > 0;

      const session = await tx.dsaSession.upsert({
        where: {
          userId_date: {
            userId,
            date: attemptDateObj,
          },
        },
        update: {},
        create: {
          userId,
          date: attemptDateObj,
        },
      });

      const created = await tx.dsaAttempt.create({
        data: {
          userId,
          problemId: problem.id,
          attemptedAt,
          attemptDate: attemptDateObj,
          classification: validated.classification,
          timeSpentMin: validated.timeSpentMin,
          confidence: validated.confidence,
          isRevision,
          helpType: validated.helpType,
          initialApproach: cleanOptionalText(validated.initialApproach),
          finalApproach: cleanOptionalText(validated.finalApproach),
          mistakes: cleanOptionalText(validated.mistakes),
          mistakeTags: validated.mistakeTags,
          timeComplexity: cleanOptionalText(validated.timeComplexity),
          spaceComplexity: cleanOptionalText(validated.spaceComplexity),
          observation: cleanOptionalText(validated.observation),
          sessionId: session.id,
          clientRequestId: validated.clientRequestId ?? null,
        },
      });

      const allAttempts = await tx.dsaAttempt.findMany({
        where: { userId, problemId: problem.id },
        orderBy: [{ attemptedAt: "asc" }, { createdAt: "asc" }],
        select: {
          attemptedAt: true,
          attemptDate: true,
          classification: true,
        },
      });

      const recomputed = recomputeProblemState(allAttempts);
      const isNewerThanPrior =
        !problem.lastAttemptAt || attemptedAt.getTime() >= problem.lastAttemptAt.getTime();

      await tx.dsaProblem.update({
        where: { id: problem.id },
        data: {
          lastClassification: recomputed.lastClassification,
          lastAttemptAt: recomputed.lastAttemptAt,
          intervalDays: recomputed.intervalDays,
          consecutiveIndependent: recomputed.consecutiveIndependent,
          nextRevisionDate: recomputed.nextRevisionDate
            ? dsaParseDate(recomputed.nextRevisionDate)
            : null,
          ...(isNewerThanPrior ? { manualNextRevisionDate: null } : {}),
        },
      });

      // Only automatic topic transition allowed: not_started -> in_progress
      await tx.dsaTopic.updateMany({
        where: {
          id: problem.topicId,
          userId,
          status: "not_started",
        },
        data: { status: "in_progress" },
      });

      return { attempt: created, deduplicated: false };
    },
    { maxWait: 5_000, timeout: 15_000 }
  );

  revalidateDsaAttemptPaths(problem.id);
  return { ok: true, ...result };
}

/**
 * Explicitly edits an existing attempt and recomputes problem state from history.
 */
export async function updateDsaAttempt(
  input: z.infer<typeof DsaUpdateAttemptSchema>
) {
  const validated = DsaUpdateAttemptSchema.parse(input);
  const userId = await requireDsaUserId();
  const existing = await assertDsaAttemptOwner(userId, validated.attemptId);

  const attemptDateObj = dsaParseDate(validated.attemptDate);
  const existingDateStr = existing.attemptDate.toISOString().slice(0, 10);
  const attemptedAt =
    existingDateStr === validated.attemptDate
      ? existing.attemptedAt
      : new Date(`${validated.attemptDate}T12:00:00.000Z`);

  const updated = await prisma.$transaction(
    async (tx) => {
      const session = await tx.dsaSession.upsert({
        where: {
          userId_date: {
            userId,
            date: attemptDateObj,
          },
        },
        update: {},
        create: {
          userId,
          date: attemptDateObj,
        },
      });

      const row = await tx.dsaAttempt.update({
        where: { id: existing.id },
        data: {
          attemptedAt,
          attemptDate: attemptDateObj,
          classification: validated.classification,
          timeSpentMin: validated.timeSpentMin,
          confidence: validated.confidence,
          isRevision: validated.isRevision,
          helpType: validated.helpType,
          initialApproach: cleanOptionalText(validated.initialApproach),
          finalApproach: cleanOptionalText(validated.finalApproach),
          mistakes: cleanOptionalText(validated.mistakes),
          mistakeTags: validated.mistakeTags,
          timeComplexity: cleanOptionalText(validated.timeComplexity),
          spaceComplexity: cleanOptionalText(validated.spaceComplexity),
          observation: cleanOptionalText(validated.observation),
          sessionId: session.id,
        },
      });

      const allAttempts = await tx.dsaAttempt.findMany({
        where: { userId, problemId: existing.problemId },
        orderBy: [{ attemptedAt: "asc" }, { createdAt: "asc" }],
        select: {
          attemptedAt: true,
          attemptDate: true,
          classification: true,
        },
      });

      const recomputed = recomputeProblemState(allAttempts);
      await tx.dsaProblem.update({
        where: { id: existing.problemId },
        data: {
          lastClassification: recomputed.lastClassification,
          lastAttemptAt: recomputed.lastAttemptAt,
          intervalDays: recomputed.intervalDays,
          consecutiveIndependent: recomputed.consecutiveIndependent,
          nextRevisionDate: recomputed.nextRevisionDate
            ? dsaParseDate(recomputed.nextRevisionDate)
            : null,
        },
      });

      return row;
    },
    { maxWait: 5_000, timeout: 15_000 }
  );

  revalidateDsaAttemptPaths(existing.problemId);
  return { ok: true, attempt: updated };
}

/**
 * Explicitly deletes an attempt and recomputes problem state from remaining history.
 */
export async function deleteDsaAttempt(
  input: z.infer<typeof DeleteAttemptSchema>
) {
  const validated = DeleteAttemptSchema.parse(input);
  const userId = await requireDsaUserId();
  const existing = await assertDsaAttemptOwner(userId, validated.attemptId);

  await prisma.$transaction(
    async (tx) => {
      await tx.dsaAttempt.delete({ where: { id: existing.id } });

      const remaining = await tx.dsaAttempt.findMany({
        where: { userId, problemId: existing.problemId },
        orderBy: [{ attemptedAt: "asc" }, { createdAt: "asc" }],
        select: {
          attemptedAt: true,
          attemptDate: true,
          classification: true,
        },
      });

      const recomputed = recomputeProblemState(remaining);
      await tx.dsaProblem.update({
        where: { id: existing.problemId },
        data: {
          lastClassification: recomputed.lastClassification,
          lastAttemptAt: recomputed.lastAttemptAt,
          intervalDays: recomputed.intervalDays,
          consecutiveIndependent: recomputed.consecutiveIndependent,
          nextRevisionDate: recomputed.nextRevisionDate
            ? dsaParseDate(recomputed.nextRevisionDate)
            : null,
          ...(remaining.length === 0 ? { manualNextRevisionDate: null } : {}),
        },
      });
    },
    { maxWait: 5_000, timeout: 15_000 }
  );

  revalidateDsaAttemptPaths(existing.problemId);
  return { ok: true };
}
