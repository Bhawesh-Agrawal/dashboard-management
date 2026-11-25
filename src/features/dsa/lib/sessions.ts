import { prisma } from "@/lib/prisma";
import { getNow } from "@/lib/clock";
import { requireDsaUserId } from "./ownership";
import { dsaDateStr, dsaToday, DSA_DEFAULT_TIMEZONE } from "./time";
import type { DsaClassificationValue, DsaHelpTypeValue } from "./schemas";

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

export interface DerivedSessionCounts {
  attempted: number;
  solvedIndependently: number;
  needingHelp: number;
  notUnderstood: number;
  topicsPractised: string[];
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

/**
 * Pure computation of derived session counts and topics practised from linked attempts.
 * Never stored on DsaSession.
 */
export function deriveSessionMetrics(
  attempts: Array<{ classification: DsaClassificationValue; topicName: string }>
): DerivedSessionCounts {
  let solvedIndependently = 0;
  let needingHelp = 0;
  let notUnderstood = 0;
  const topics = new Set<string>();

  for (const a of attempts) {
    topics.add(a.topicName);
    if (a.classification === "independent") {
      solvedIndependently++;
    } else if (a.classification === "not_understood") {
      notUnderstood++;
    } else {
      // effortful, hinted, editorial
      needingHelp++;
    }
  }

  return {
    attempted: attempts.length,
    solvedIndependently,
    needingHelp,
    notUnderstood,
    topicsPractised: Array.from(topics),
  };
}

export async function getDsaSessionsPageData(
  explicitUserId?: string,
  tz: string = DSA_DEFAULT_TIMEZONE
) {
  const userId = explicitUserId ?? (await requireDsaUserId());
  const todayStr = dsaToday(getNow(), tz);

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
