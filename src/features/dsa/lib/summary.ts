import { prisma } from "@/lib/prisma";
import { getNow } from "@/lib/clock";
import { buildRevisionQueue } from "./revision";
import { getUserTimezone } from "@/lib/timezone-server";
import { dsaToday } from "./time";
import type { DsaClassificationValue, DsaDifficultyValue } from "./schemas";

export interface DsaDueSummary {
  isConfigured: boolean;
  dueToday: number;
  overdue: number;
  topOverdue: string[];
}

export function computeDsaDueSummary(input: {
  hasSettings: boolean;
  problems: Array<{
    id: string;
    topicId: string;
    topicName: string;
    subtopic: string;
    title: string;
    difficulty: DsaDifficultyValue | null;
    sourceUrl: string;
    archived: boolean;
    lastClassification: DsaClassificationValue | null;
    intervalDays: number | null;
    consecutiveIndependent: number;
    nextRevisionDate: Date | string | null;
    manualNextRevisionDate: Date | string | null;
    attempts: Array<{
      attemptDate: Date | string;
      classification: DsaClassificationValue;
      isRevision: boolean;
    }>;
  }>;
  todayStr: string;
}): DsaDueSummary {
  const activeProblems = input.problems.filter((p) => !p.archived);
  const isConfigured = input.hasSettings || activeProblems.length > 0;
  if (!isConfigured) {
    return {
      isConfigured: false,
      dueToday: 0,
      overdue: 0,
      topOverdue: [],
    };
  }

  const queue = buildRevisionQueue(activeProblems, input.todayStr);
  return {
    isConfigured: true,
    dueToday: queue.dueToday.length,
    overdue: queue.overdue.length,
    topOverdue: queue.overdue.slice(0, 3).map((item) => item.title),
  };
}

/**
 * Pure server function returning dueToday, overdue, and top 3 overdue titles
 * for /today card and future morning briefs.
 */
export async function getDsaDueSummary(
  userId: string,
  now: Date = getNow(),
  tz?: string
): Promise<DsaDueSummary> {
  const resolvedTz = tz ?? (await getUserTimezone());
  const todayStr = dsaToday(now, resolvedTz);

  const [settings, problems] = await Promise.all([
    prisma.dsaSettings.findUnique({
      where: { userId },
      select: { id: true },
    }),
    prisma.dsaProblem.findMany({
      where: { userId, archived: false },
      include: {
        topic: { select: { name: true } },
        attempts: {
          select: {
            attemptDate: true,
            classification: true,
            isRevision: true,
          },
        },
      },
    }),
  ]);

  return computeDsaDueSummary({
    hasSettings: settings !== null,
    problems: problems.map((p) => ({
      id: p.id,
      topicId: p.topicId,
      topicName: p.topic.name,
      subtopic: p.subtopic,
      title: p.title,
      difficulty: p.difficulty,
      sourceUrl: p.sourceUrl,
      archived: p.archived,
      lastClassification: p.lastClassification,
      intervalDays: p.intervalDays,
      consecutiveIndependent: p.consecutiveIndependent,
      nextRevisionDate: p.nextRevisionDate,
      manualNextRevisionDate: p.manualNextRevisionDate,
      attempts: p.attempts,
    })),
    todayStr,
  });
}
