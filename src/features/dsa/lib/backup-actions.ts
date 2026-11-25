"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getNow } from "@/lib/clock";
import { requireDsaUserId } from "./ownership";
import {
  DSA_BACKUP_SCHEMA_VERSION,
  validateBackupPayload,
  type DsaBackupPayload,
} from "./backup-schema";
import { dsaDateStr, dsaParseDate, dsaToday, DSA_DEFAULT_TIMEZONE } from "./time";
import type { DsaPhase } from "./schemas";

function revalidateAllDsaPaths() {
  revalidatePath("/dsa");
  revalidatePath("/dsa/topics");
  revalidatePath("/dsa/problems");
  revalidatePath("/dsa/revision");
  revalidatePath("/dsa/log");
  revalidatePath("/dsa/report");
  revalidatePath("/dsa/contests");
  revalidatePath("/dsa/settings");
  revalidatePath("/today");
}

/**
 * Exports all DSA tables for the authenticated user as one JSON payload
 * and updates DsaSettings.lastBackupAt.
 */
export async function exportDsaBackup(): Promise<{
  ok: true;
  backup: DsaBackupPayload;
}> {
  const userId = await requireDsaUserId();
  const now = getNow();
  const todayDate = dsaParseDate(dsaToday(now, DSA_DEFAULT_TIMEZONE));

  const [settingsRow, topics, problems, attempts, sessions, contests] = await Promise.all([
    prisma.dsaSettings.upsert({
      where: { userId },
      update: { lastBackupAt: now },
      create: {
        userId,
        programmeStartDate: todayDate,
        programmeLengthDays: 90,
        phases: [],
        lastBackupAt: now,
      },
    }),
    prisma.dsaTopic.findMany({ where: { userId }, orderBy: { order: "asc" } }),
    prisma.dsaProblem.findMany({
      where: { userId },
      orderBy: [{ topicId: "asc" }, { orderInTopic: "asc" }],
    }),
    prisma.dsaAttempt.findMany({ where: { userId }, orderBy: { attemptedAt: "asc" } }),
    prisma.dsaSession.findMany({ where: { userId }, orderBy: { date: "asc" } }),
    prisma.dsaContest.findMany({ where: { userId }, orderBy: { date: "asc" } }),
  ]);

  const backup: DsaBackupPayload = {
    schemaVersion: DSA_BACKUP_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    data: {
      settings: settingsRow
        ? {
            id: settingsRow.id,
            programmeStartDate: dsaDateStr(settingsRow.programmeStartDate),
            programmeLengthDays: settingsRow.programmeLengthDays,
            phases: Array.isArray(settingsRow.phases)
              ? (settingsRow.phases as unknown as DsaPhase[])
              : [],
            currentTopicId: settingsRow.currentTopicId,
            lastBackupAt: settingsRow.lastBackupAt
              ? settingsRow.lastBackupAt.toISOString()
              : null,
          }
        : null,
      topics: topics.map((t) => ({
        id: t.id,
        name: t.name,
        order: t.order,
        status: t.status,
      })),
      problems: problems.map((p) => ({
        id: p.id,
        topicId: p.topicId,
        subtopic: p.subtopic,
        title: p.title,
        difficulty: p.difficulty,
        sourceUrl: p.sourceUrl,
        platform: p.platform,
        platformId: p.platformId,
        orderInTopic: p.orderInTopic,
        tags: p.tags,
        importKey: p.importKey,
        archived: p.archived,
        lastClassification: p.lastClassification,
        lastAttemptAt: p.lastAttemptAt ? p.lastAttemptAt.toISOString() : null,
        intervalDays: p.intervalDays,
        consecutiveIndependent: p.consecutiveIndependent,
        nextRevisionDate: p.nextRevisionDate ? dsaDateStr(p.nextRevisionDate) : null,
        manualNextRevisionDate: p.manualNextRevisionDate
          ? dsaDateStr(p.manualNextRevisionDate)
          : null,
      })),
      attempts: attempts.map((a) => ({
        id: a.id,
        problemId: a.problemId,
        attemptedAt: a.attemptedAt.toISOString(),
        attemptDate: dsaDateStr(a.attemptDate),
        classification: a.classification,
        timeSpentMin: a.timeSpentMin,
        confidence: a.confidence,
        isRevision: a.isRevision,
        helpType: a.helpType,
        initialApproach: a.initialApproach,
        finalApproach: a.finalApproach,
        mistakes: a.mistakes,
        mistakeTags: a.mistakeTags,
        timeComplexity: a.timeComplexity,
        spaceComplexity: a.spaceComplexity,
        observation: a.observation,
        sessionId: a.sessionId,
        clientRequestId: a.clientRequestId,
      })),
      sessions: sessions.map((s) => ({
        id: s.id,
        date: dsaDateStr(s.date),
        durationMin: s.durationMin,
        observations: s.observations,
        nextSessionAvailabilityMin: s.nextSessionAvailabilityMin,
        nextSessionNote: s.nextSessionNote,
      })),
      contests: contests.map((c) => ({
        id: c.id,
        platform: c.platform,
        name: c.name,
        date: dsaDateStr(c.date),
        problemsAttempted: c.problemsAttempted,
        problemsSolved: c.problemsSolved,
        rankOrRating: c.rankOrRating,
        upsolveProblems: c.upsolveProblems,
        conceptsMissed: c.conceptsMissed,
      })),
    },
  };

  revalidatePath("/dsa");
  revalidatePath("/dsa/settings");

  return { ok: true, backup };
}

const RestoreRequestSchema = z.object({
  rawPayload: z.unknown(),
  mode: z.enum(["merge", "replace"]),
  confirmationText: z.string().optional(),
});

/**
 * Restores a validated DSA backup in a single atomic transaction.
 * Preserves all record IDs while binding ownership to the authenticated userId.
 */
export async function restoreDsaBackup(
  input: z.infer<typeof RestoreRequestSchema>
): Promise<{
  ok: boolean;
  error?: string;
  restored?: {
    topics: number;
    problems: number;
    attempts: number;
    sessions: number;
    contests: number;
  };
}> {
  const req = RestoreRequestSchema.parse(input);
  const userId = await requireDsaUserId();

  if (req.mode === "replace" && req.confirmationText !== "REPLACE") {
    return { ok: false, error: 'Type "REPLACE" to confirm replacing all DSA data.' };
  }

  const check = validateBackupPayload(req.rawPayload);
  if (!check.ok) {
    return { ok: false, error: check.error };
  }

  const { data } = check.payload;

  await prisma.$transaction(async (tx) => {
    if (req.mode === "replace") {
      await tx.dsaAttempt.deleteMany({ where: { userId } });
      await tx.dsaProblem.deleteMany({ where: { userId } });
      await tx.dsaTopic.deleteMany({ where: { userId } });
      await tx.dsaSession.deleteMany({ where: { userId } });
      await tx.dsaContest.deleteMany({ where: { userId } });
      await tx.dsaSettings.deleteMany({ where: { userId } });

      if (data.topics.length > 0) {
        await tx.dsaTopic.createMany({
          data: data.topics.map((t) => ({
            id: t.id,
            userId,
            name: t.name,
            order: t.order,
            status: t.status,
          })),
        });
      }

      if (data.sessions.length > 0) {
        await tx.dsaSession.createMany({
          data: data.sessions.map((s) => ({
            id: s.id,
            userId,
            date: dsaParseDate(s.date),
            durationMin: s.durationMin,
            observations: s.observations,
            nextSessionAvailabilityMin: s.nextSessionAvailabilityMin,
            nextSessionNote: s.nextSessionNote,
          })),
        });
      }

      if (data.problems.length > 0) {
        await tx.dsaProblem.createMany({
          data: data.problems.map((p) => ({
            id: p.id,
            userId,
            topicId: p.topicId,
            subtopic: p.subtopic,
            title: p.title,
            difficulty: p.difficulty,
            sourceUrl: p.sourceUrl,
            platform: p.platform,
            platformId: p.platformId,
            orderInTopic: p.orderInTopic,
            tags: p.tags,
            importKey: p.importKey,
            archived: p.archived,
            lastClassification: p.lastClassification,
            lastAttemptAt: p.lastAttemptAt ? new Date(p.lastAttemptAt) : null,
            intervalDays: p.intervalDays,
            consecutiveIndependent: p.consecutiveIndependent,
            nextRevisionDate: p.nextRevisionDate ? dsaParseDate(p.nextRevisionDate) : null,
            manualNextRevisionDate: p.manualNextRevisionDate
              ? dsaParseDate(p.manualNextRevisionDate)
              : null,
          })),
        });
      }

      if (data.attempts.length > 0) {
        await tx.dsaAttempt.createMany({
          data: data.attempts.map((a) => ({
            id: a.id,
            userId,
            problemId: a.problemId,
            attemptedAt: new Date(a.attemptedAt),
            attemptDate: dsaParseDate(a.attemptDate),
            classification: a.classification,
            timeSpentMin: a.timeSpentMin,
            confidence: a.confidence,
            isRevision: a.isRevision,
            helpType: a.helpType,
            initialApproach: a.initialApproach,
            finalApproach: a.finalApproach,
            mistakes: a.mistakes,
            mistakeTags: a.mistakeTags,
            timeComplexity: a.timeComplexity,
            spaceComplexity: a.spaceComplexity,
            observation: a.observation,
            sessionId: a.sessionId,
            clientRequestId: a.clientRequestId,
          })),
        });
      }

      if (data.contests.length > 0) {
        await tx.dsaContest.createMany({
          data: data.contests.map((c) => ({
            id: c.id,
            userId,
            platform: c.platform,
            name: c.name,
            date: dsaParseDate(c.date),
            problemsAttempted: c.problemsAttempted,
            problemsSolved: c.problemsSolved,
            rankOrRating: c.rankOrRating,
            upsolveProblems: c.upsolveProblems,
            conceptsMissed: c.conceptsMissed,
          })),
        });
      }

      if (data.settings) {
        await tx.dsaSettings.create({
          data: {
            id: data.settings.id,
            userId,
            programmeStartDate: dsaParseDate(data.settings.programmeStartDate),
            programmeLengthDays: data.settings.programmeLengthDays,
            phases: data.settings.phases,
            currentTopicId: data.settings.currentTopicId,
            lastBackupAt: data.settings.lastBackupAt
              ? new Date(data.settings.lastBackupAt)
              : null,
          },
        });
      }
      return;
    }

    // Merge mode: upsert by ID (never deletes), strictly scoped to userId
    const topicIdMap = new Map<string, string>();
    for (const t of data.topics) {
      const existingById = await tx.dsaTopic.findFirst({
        where: { id: t.id, userId },
      });
      if (existingById) {
        await tx.dsaTopic.update({
          where: { id: existingById.id },
          data: { name: t.name, order: t.order, status: t.status },
        });
        topicIdMap.set(t.id, existingById.id);
      } else {
        const existingByName = await tx.dsaTopic.findUnique({
          where: { userId_name: { userId, name: t.name } },
        });
        if (existingByName) {
          await tx.dsaTopic.update({
            where: { id: existingByName.id },
            data: { order: t.order, status: t.status },
          });
          topicIdMap.set(t.id, existingByName.id);
        } else {
          const created = await tx.dsaTopic.create({
            data: {
              id: t.id,
              userId,
              name: t.name,
              order: t.order,
              status: t.status,
            },
          });
          topicIdMap.set(t.id, created.id);
        }
      }
    }

    const sessionIdMap = new Map<string, string>();
    for (const s of data.sessions) {
      const dateObj = dsaParseDate(s.date);
      const existingById = await tx.dsaSession.findFirst({
        where: { id: s.id, userId },
      });
      if (existingById) {
        await tx.dsaSession.update({
          where: { id: existingById.id },
          data: {
            date: dateObj,
            durationMin: s.durationMin,
            observations: s.observations,
            nextSessionAvailabilityMin: s.nextSessionAvailabilityMin,
            nextSessionNote: s.nextSessionNote,
          },
        });
        sessionIdMap.set(s.id, existingById.id);
      } else {
        const existingByDate = await tx.dsaSession.findUnique({
          where: { userId_date: { userId, date: dateObj } },
        });
        if (existingByDate) {
          await tx.dsaSession.update({
            where: { id: existingByDate.id },
            data: {
              durationMin: s.durationMin,
              observations: s.observations,
              nextSessionAvailabilityMin: s.nextSessionAvailabilityMin,
              nextSessionNote: s.nextSessionNote,
            },
          });
          sessionIdMap.set(s.id, existingByDate.id);
        } else {
          const created = await tx.dsaSession.create({
            data: {
              id: s.id,
              userId,
              date: dateObj,
              durationMin: s.durationMin,
              observations: s.observations,
              nextSessionAvailabilityMin: s.nextSessionAvailabilityMin,
              nextSessionNote: s.nextSessionNote,
            },
          });
          sessionIdMap.set(s.id, created.id);
        }
      }
    }

    const problemIdMap = new Map<string, string>();
    for (const p of data.problems) {
      const resolvedTopicId = topicIdMap.get(p.topicId) ?? p.topicId;
      const existingById = await tx.dsaProblem.findFirst({
        where: { id: p.id, userId },
      });
      const problemFields = {
        topicId: resolvedTopicId,
        subtopic: p.subtopic,
        title: p.title,
        difficulty: p.difficulty,
        sourceUrl: p.sourceUrl,
        platform: p.platform,
        platformId: p.platformId,
        orderInTopic: p.orderInTopic,
        tags: p.tags,
        importKey: p.importKey,
        archived: p.archived,
        lastClassification: p.lastClassification,
        lastAttemptAt: p.lastAttemptAt ? new Date(p.lastAttemptAt) : null,
        intervalDays: p.intervalDays,
        consecutiveIndependent: p.consecutiveIndependent,
        nextRevisionDate: p.nextRevisionDate ? dsaParseDate(p.nextRevisionDate) : null,
        manualNextRevisionDate: p.manualNextRevisionDate
          ? dsaParseDate(p.manualNextRevisionDate)
          : null,
      };
      if (existingById) {
        await tx.dsaProblem.update({
          where: { id: existingById.id },
          data: problemFields,
        });
        problemIdMap.set(p.id, existingById.id);
      } else {
        const existingByKey = await tx.dsaProblem.findUnique({
          where: { userId_importKey: { userId, importKey: p.importKey } },
        });
        if (existingByKey) {
          await tx.dsaProblem.update({
            where: { id: existingByKey.id },
            data: problemFields,
          });
          problemIdMap.set(p.id, existingByKey.id);
        } else {
          const created = await tx.dsaProblem.create({
            data: {
              id: p.id,
              userId,
              ...problemFields,
            },
          });
          problemIdMap.set(p.id, created.id);
        }
      }
    }

    for (const a of data.attempts) {
      const resolvedProblemId = problemIdMap.get(a.problemId) ?? a.problemId;
      const resolvedSessionId = a.sessionId
        ? sessionIdMap.get(a.sessionId) ?? a.sessionId
        : null;
      const existingById = await tx.dsaAttempt.findFirst({
        where: { id: a.id, userId },
      });
      const attemptFields = {
        problemId: resolvedProblemId,
        attemptedAt: new Date(a.attemptedAt),
        attemptDate: dsaParseDate(a.attemptDate),
        classification: a.classification,
        timeSpentMin: a.timeSpentMin,
        confidence: a.confidence,
        isRevision: a.isRevision,
        helpType: a.helpType,
        initialApproach: a.initialApproach,
        finalApproach: a.finalApproach,
        mistakes: a.mistakes,
        mistakeTags: a.mistakeTags,
        timeComplexity: a.timeComplexity,
        spaceComplexity: a.spaceComplexity,
        observation: a.observation,
        sessionId: resolvedSessionId,
        clientRequestId: a.clientRequestId,
      };
      if (existingById) {
        await tx.dsaAttempt.update({
          where: { id: existingById.id },
          data: attemptFields,
        });
      } else {
        await tx.dsaAttempt.create({
          data: {
            id: a.id,
            userId,
            ...attemptFields,
          },
        });
      }
    }

    for (const c of data.contests) {
      const existingById = await tx.dsaContest.findFirst({
        where: { id: c.id, userId },
      });
      const contestFields = {
        platform: c.platform,
        name: c.name,
        date: dsaParseDate(c.date),
        problemsAttempted: c.problemsAttempted,
        problemsSolved: c.problemsSolved,
        rankOrRating: c.rankOrRating,
        upsolveProblems: c.upsolveProblems,
        conceptsMissed: c.conceptsMissed,
      };
      if (existingById) {
        await tx.dsaContest.update({
          where: { id: existingById.id },
          data: contestFields,
        });
      } else {
        await tx.dsaContest.create({
          data: {
            id: c.id,
            userId,
            ...contestFields,
          },
        });
      }
    }

    if (data.settings) {
      const resolvedCurrentTopic = data.settings.currentTopicId
        ? topicIdMap.get(data.settings.currentTopicId) ?? data.settings.currentTopicId
        : null;
      await tx.dsaSettings.upsert({
        where: { userId },
        update: {
          programmeStartDate: dsaParseDate(data.settings.programmeStartDate),
          programmeLengthDays: data.settings.programmeLengthDays,
          phases: data.settings.phases,
          currentTopicId: resolvedCurrentTopic,
        },
        create: {
          id: data.settings.id,
          userId,
          programmeStartDate: dsaParseDate(data.settings.programmeStartDate),
          programmeLengthDays: data.settings.programmeLengthDays,
          phases: data.settings.phases,
          currentTopicId: resolvedCurrentTopic,
          lastBackupAt: data.settings.lastBackupAt
            ? new Date(data.settings.lastBackupAt)
            : null,
        },
      });
    }
  });

  revalidateAllDsaPaths();

  return {
    ok: true,
    restored: {
      topics: data.topics.length,
      problems: data.problems.length,
      attempts: data.attempts.length,
      sessions: data.sessions.length,
      contests: data.contests.length,
    },
  };
}
