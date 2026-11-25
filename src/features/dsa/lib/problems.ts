import { prisma } from "@/lib/prisma";
import { getNow } from "@/lib/clock";
import { UnauthorizedError } from "@/lib/auth";
import { requireDsaUserId } from "./ownership";
import { addDaysToDateStr, dsaDateStr, dsaToday, DSA_DEFAULT_TIMEZONE } from "./time";
import type {
  DsaClassificationValue,
  DsaDifficultyValue,
  DsaHelpTypeValue,
} from "./schemas";

export interface ProblemListItem {
  id: string;
  topicId: string;
  topicName: string;
  subtopic: string;
  title: string;
  difficulty: DsaDifficultyValue | null;
  sourceUrl: string;
  platform: string;
  platformId: string | null;
  orderInTopic: number;
  tags: string[];
  archived: boolean;
  lastClassification: DsaClassificationValue | null;
  lastAttemptAt: string | null;
  intervalDays: number | null;
  consecutiveIndependent: number;
  nextRevisionDate: string | null;
  manualNextRevisionDate: string | null;
  effectiveRevisionDate: string | null;
  attemptCount: number;
}

export type ProblemStatusFilter = "all" | "not_attempted" | DsaClassificationValue;
export type ProblemRevisionDueFilter = "all" | "overdue" | "today" | "next_7_days" | "none";

export interface ProblemFilterCriteria {
  query?: string;
  topicId?: string;
  subtopic?: string;
  difficulty?: "all" | DsaDifficultyValue;
  status?: ProblemStatusFilter;
  revisionDue?: ProblemRevisionDueFilter;
  showArchived?: boolean;
  todayStr: string;
}

/**
 * Pure filtering logic for the DSA problem bank.
 */
export function filterDsaProblems(
  problems: ProblemListItem[],
  criteria: ProblemFilterCriteria
): ProblemListItem[] {
  const q = (criteria.query ?? "").trim().toLowerCase();
  const next7End = addDaysToDateStr(criteria.todayStr, 7);

  return problems.filter((p) => {
    if (!criteria.showArchived && p.archived) return false;
    if (criteria.topicId && criteria.topicId !== "all" && p.topicId !== criteria.topicId) {
      return false;
    }
    if (criteria.subtopic && criteria.subtopic !== "all" && p.subtopic !== criteria.subtopic) {
      return false;
    }
    if (criteria.difficulty && criteria.difficulty !== "all" && p.difficulty !== criteria.difficulty) {
      return false;
    }
    if (criteria.status && criteria.status !== "all") {
      if (criteria.status === "not_attempted") {
        if (p.lastClassification !== null) return false;
      } else if (p.lastClassification !== criteria.status) {
        return false;
      }
    }
    if (criteria.revisionDue && criteria.revisionDue !== "all") {
      const rev = p.effectiveRevisionDate;
      if (criteria.revisionDue === "none") {
        if (rev !== null) return false;
      } else if (criteria.revisionDue === "overdue") {
        if (!rev || rev >= criteria.todayStr) return false;
      } else if (criteria.revisionDue === "today") {
        if (rev !== criteria.todayStr) return false;
      } else if (criteria.revisionDue === "next_7_days") {
        if (!rev || rev < criteria.todayStr || rev > next7End) return false;
      }
    }
    if (q) {
      const hay = `${p.title} ${p.subtopic} ${p.tags.join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export async function getDsaProblemsPageData(
  explicitUserId?: string,
  tz: string = DSA_DEFAULT_TIMEZONE
) {
  const userId = explicitUserId ?? (await requireDsaUserId());
  const todayStr = dsaToday(getNow(), tz);

  const [settings, topics, rawProblems] = await Promise.all([
    prisma.dsaSettings.findUnique({
      where: { userId },
      select: { currentTopicId: true },
    }),
    prisma.dsaTopic.findMany({
      where: { userId },
      orderBy: { order: "asc" },
      select: { id: true, name: true, order: true },
    }),
    prisma.dsaProblem.findMany({
      where: { userId },
      orderBy: [{ topic: { order: "asc" } }, { orderInTopic: "asc" }],
      include: {
        topic: { select: { name: true } },
        _count: { select: { attempts: true } },
      },
    }),
  ]);

  const problems: ProblemListItem[] = rawProblems.map((p) => {
    const nextRev = p.nextRevisionDate ? dsaDateStr(p.nextRevisionDate) : null;
    const manualRev = p.manualNextRevisionDate ? dsaDateStr(p.manualNextRevisionDate) : null;
    return {
      id: p.id,
      topicId: p.topicId,
      topicName: p.topic.name,
      subtopic: p.subtopic,
      title: p.title,
      difficulty: p.difficulty,
      sourceUrl: p.sourceUrl,
      platform: p.platform,
      platformId: p.platformId,
      orderInTopic: p.orderInTopic,
      tags: p.tags,
      archived: p.archived,
      lastClassification: p.lastClassification,
      lastAttemptAt: p.lastAttemptAt ? p.lastAttemptAt.toISOString() : null,
      intervalDays: p.intervalDays,
      consecutiveIndependent: p.consecutiveIndependent,
      nextRevisionDate: nextRev,
      manualNextRevisionDate: manualRev,
      effectiveRevisionDate: manualRev ?? nextRev,
      attemptCount: p._count.attempts,
    };
  });

  return {
    todayStr,
    currentTopicId: settings?.currentTopicId ?? topics[0]?.id ?? null,
    topics,
    problems,
  };
}

export interface AttemptDetailItem {
  id: string;
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

export async function getDsaProblemDetail(problemId: string, explicitUserId?: string) {
  const userId = explicitUserId ?? (await requireDsaUserId());
  const problem = await prisma.dsaProblem.findFirst({
    where: { id: problemId, userId },
    include: {
      topic: { select: { id: true, name: true } },
      attempts: {
        orderBy: { attemptedAt: "desc" },
      },
    },
  });

  if (!problem) {
    throw new UnauthorizedError("Problem not found or unauthorized");
  }

  const nextRev = problem.nextRevisionDate ? dsaDateStr(problem.nextRevisionDate) : null;
  const manualRev = problem.manualNextRevisionDate
    ? dsaDateStr(problem.manualNextRevisionDate)
    : null;

  const attempts: AttemptDetailItem[] = problem.attempts.map((a) => ({
    id: a.id,
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

  const failureCount = attempts.filter(
    (a) => a.classification === "editorial" || a.classification === "not_understood"
  ).length;

  return {
    id: problem.id,
    topicId: problem.topicId,
    topicName: problem.topic.name,
    subtopic: problem.subtopic,
    title: problem.title,
    difficulty: problem.difficulty,
    sourceUrl: problem.sourceUrl,
    platform: problem.platform,
    platformId: problem.platformId,
    orderInTopic: problem.orderInTopic,
    tags: problem.tags,
    archived: problem.archived,
    lastClassification: problem.lastClassification,
    lastAttemptAt: problem.lastAttemptAt ? problem.lastAttemptAt.toISOString() : null,
    intervalDays: problem.intervalDays,
    consecutiveIndependent: problem.consecutiveIndependent,
    nextRevisionDate: nextRev,
    manualNextRevisionDate: manualRev,
    effectiveRevisionDate: manualRev ?? nextRev,
    failureCount,
    attempts,
  };
}
