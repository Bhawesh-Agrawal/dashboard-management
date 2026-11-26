import { prisma } from "@/lib/prisma";
import { getNow } from "@/lib/clock";
import { requireDsaUserId } from "./ownership";
import { getUserTimezone } from "@/lib/timezone-server";
import { dsaDateStr, dsaToday } from "./time";
import { deriveSessionMetrics, type DerivedSessionCounts } from "./metrics-pure";
import type { DsaClassificationValue, DsaHelpTypeValue } from "./schemas";

export { deriveSessionMetrics };
export type { DerivedSessionCounts };

export interface SessionAttemptItem {
  id: string;
  problemId: string;
  problemTitle: string;
  topicName: string;
  attemptedAt: string;
  attemptDate: string;
  classification: DsaClassificationValue;
  timeSpentMin: number;
  confidence: number;
  isRevision: boolean;
  helpType: DsaHelpTypeValue;
  initialApproach: string | null;
  finalApproach: string | null;
  mistakes: string | null;
  mistakeTags: string[];
  timeComplexity: string | null;
  spaceComplexity: string | null;
  observation: string | null;
}

export interface DsaSessionViewItem {
  id: string;
  date: string;
  durationMin: number | null;
  observations: string | null;
  nextSessionAvailabilityMin: number | null;
  nextSessionNote: string | null;
  derived: DerivedSessionCounts;
  attempts: SessionAttemptItem[];
}

export async function getDsaSessionsPageData(
  explicitUserId?: string,
  tz?: string
) {
  const userId = explicitUserId ?? (await requireDsaUserId());
  const resolvedTz = tz ?? (await getUserTimezone());
  const todayStr = dsaToday(getNow(), resolvedTz);

  const [sessions, problems] = await Promise.all([
    prisma.dsaSession.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take: 60,
      include: {
        attempts: {
          orderBy: { attemptedAt: "asc" },
          include: {
            problem: {
              select: {
                id: true,
                title: true,
                topic: { select: { name: true } },
              },
            },
          },
        },
      },
    }),
    prisma.dsaProblem.findMany({
      where: { userId, archived: false },
      orderBy: [{ topic: { order: "asc" } }, { orderInTopic: "asc" }],
      select: {
        id: true,
        title: true,
        topic: { select: { name: true } },
        _count: { select: { attempts: true } },
      },
    }),
  ]);

  const sessionItems: DsaSessionViewItem[] = sessions.map((s) => {
    const attemptItems: SessionAttemptItem[] = s.attempts.map((a) => ({
      id: a.id,
      problemId: a.problemId,
      problemTitle: a.problem.title,
      topicName: a.problem.topic.name,
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
    }));

    return {
      id: s.id,
      date: dsaDateStr(s.date),
      durationMin: s.durationMin,
      observations: s.observations,
      nextSessionAvailabilityMin: s.nextSessionAvailabilityMin,
      nextSessionNote: s.nextSessionNote,
      derived: deriveSessionMetrics(attemptItems),
      attempts: attemptItems,
    };
  });

  const problemOptions = problems.map((p) => ({
    id: p.id,
    title: p.title,
    topicName: p.topic.name,
    hasAttempts: p._count.attempts > 0,
  }));

  return {
    todayStr,
    sessions: sessionItems,
    problemOptions,
  };
}
