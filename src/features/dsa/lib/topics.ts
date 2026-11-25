import { prisma } from "@/lib/prisma";
import { getNow } from "@/lib/clock";
import { requireDsaUserId } from "./ownership";
import { addDaysToDateStr, dsaDateStr, dsaParseDate, dsaToday, DSA_DEFAULT_TIMEZONE } from "./time";
import type { DsaClassificationValue, DsaTopicStatusValue } from "./schemas";

export interface TopicClassificationCounts {
  independent: number;
  effortful: number;
  hinted: number;
  editorial: number;
  not_understood: number;
}

export interface TopicOverviewItem {
  id: string;
  name: string;
  order: number;
  status: DsaTopicStatusValue;
  isCurrent: boolean;
  totalProblems: number;
  attemptedProblems: number;
  classificationCounts: TopicClassificationCounts;
  overdueCount: number;
  readinessEvidence: {
    independentPercent: number;
    failuresLast14Days: number;
    overdueCount: number;
  };
}

export interface TopicsSummaryCounts {
  total: number;
  covered: number;
  inProgress: number;
  remaining: number;
}

export interface TopicsOverviewResult {
  topics: TopicOverviewItem[];
  summary: TopicsSummaryCounts;
  currentTopicId: string | null;
}

export interface TopicComputeInput {
  topics: Array<{
    id: string;
    name: string;
    order: number;
    status: DsaTopicStatusValue;
  }>;
  problems: Array<{
    id: string;
    topicId: string;
    archived: boolean;
    lastClassification: DsaClassificationValue | null;
    nextRevisionDate: Date | string | null;
    manualNextRevisionDate: Date | string | null;
  }>;
  recentFailedProblemIds: Set<string>;
  currentTopicId: string | null;
  todayStr: string;
}

/**
 * Pure computation of topic metrics, summary counts, and readiness evidence.
 */
export function computeTopicsOverview(input: TopicComputeInput): TopicsOverviewResult {
  const problemsByTopic = new Map<string, TopicComputeInput["problems"]>();
  for (const p of input.problems) {
    if (p.archived) continue;
    const list = problemsByTopic.get(p.topicId) ?? [];
    list.push(p);
    problemsByTopic.set(p.topicId, list);
  }

  const topics: TopicOverviewItem[] = input.topics.map((t) => {
    const tProblems = problemsByTopic.get(t.id) ?? [];
    const counts: TopicClassificationCounts = {
      independent: 0,
      effortful: 0,
      hinted: 0,
      editorial: 0,
      not_understood: 0,
    };

    let attemptedProblems = 0;
    let overdueCount = 0;
    let failuresLast14Days = 0;

    for (const p of tProblems) {
      if (p.lastClassification) {
        attemptedProblems++;
        counts[p.lastClassification]++;
      }
      const effRev = p.manualNextRevisionDate ?? p.nextRevisionDate;
      if (effRev && dsaDateStr(effRev) < input.todayStr) {
        overdueCount++;
      }
      if (input.recentFailedProblemIds.has(p.id)) {
        failuresLast14Days++;
      }
    }

    const independentPercent =
      attemptedProblems > 0 ? Math.round((counts.independent / attemptedProblems) * 100) : 0;

    return {
      id: t.id,
      name: t.name,
      order: t.order,
      status: t.status,
      isCurrent: t.id === input.currentTopicId,
      totalProblems: tProblems.length,
      attemptedProblems,
      classificationCounts: counts,
      overdueCount,
      readinessEvidence: {
        independentPercent,
        failuresLast14Days,
        overdueCount,
      },
    };
  });

  let covered = 0;
  let inProgress = 0;
  let remaining = 0;

  for (const t of topics) {
    if (t.status === "practised" || t.status === "needs_revision" || t.status === "comfortable") {
      covered++;
    } else if (t.status === "in_progress") {
      inProgress++;
    } else if (t.status === "not_started") {
      remaining++;
    }
  }

  return {
    topics,
    summary: {
      total: topics.length,
      covered,
      inProgress,
      remaining,
    },
    currentTopicId: input.currentTopicId,
  };
}

export async function getDsaTopicsOverview(
  explicitUserId?: string,
  tz: string = DSA_DEFAULT_TIMEZONE
): Promise<TopicsOverviewResult> {
  const userId = explicitUserId ?? (await requireDsaUserId());
  const todayStr = dsaToday(getNow(), tz);
  const fourteenDaysAgo = dsaParseDate(addDaysToDateStr(todayStr, -14));

  const [settings, topics, problems, recentFailedAttempts] = await Promise.all([
    prisma.dsaSettings.findUnique({
      where: { userId },
      select: { currentTopicId: true },
    }),
    prisma.dsaTopic.findMany({
      where: { userId },
      orderBy: { order: "asc" },
      select: { id: true, name: true, order: true, status: true },
    }),
    prisma.dsaProblem.findMany({
      where: { userId, archived: false },
      select: {
        id: true,
        topicId: true,
        archived: true,
        lastClassification: true,
        nextRevisionDate: true,
        manualNextRevisionDate: true,
      },
    }),
    prisma.dsaAttempt.findMany({
      where: {
        userId,
        attemptDate: { gte: fourteenDaysAgo },
        classification: { in: ["editorial", "not_understood"] },
      },
      select: { problemId: true },
    }),
  ]);

  const recentFailedProblemIds = new Set(recentFailedAttempts.map((a) => a.problemId));

  return computeTopicsOverview({
    topics,
    problems,
    recentFailedProblemIds,
    currentTopicId: settings?.currentTopicId ?? null,
    todayStr,
  });
}
