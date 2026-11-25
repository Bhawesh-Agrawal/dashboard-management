import { addDaysToDateStr, diffCalendarDays, dsaDateStr } from "./time";
import { CLASSIFICATION_META } from "./constants";
import type { DsaClassificationValue, DsaDifficultyValue } from "./schemas";

export interface AttemptStateInput {
  attemptedAt: Date | string;
  attemptDate: Date | string;
  classification: DsaClassificationValue;
}

export interface RecomputedProblemState {
  lastClassification: DsaClassificationValue | null;
  lastAttemptAt: Date | null;
  intervalDays: number | null;
  consecutiveIndependent: number;
  nextRevisionDate: string | null;
}

export function getIntervalForStep(
  classification: DsaClassificationValue,
  prevConsecutiveIndependent: number
): { intervalDays: number; consecutiveIndependent: number } {
  if (classification === "independent") {
    const nextCount = prevConsecutiveIndependent + 1;
    const intervalDays = nextCount === 1 ? 7 : nextCount === 2 ? 14 : 30;
    return { intervalDays, consecutiveIndependent: nextCount };
  }
  if (classification === "effortful") {
    return { intervalDays: 3, consecutiveIndependent: 0 };
  }
  if (classification === "hinted") {
    return { intervalDays: 2, consecutiveIndependent: 0 };
  }
  // editorial | not_understood
  return { intervalDays: 1, consecutiveIndependent: 0 };
}

/**
 * Pure deterministic replay of a problem's attempt history in chronological order.
 * Always derives state from the full history rather than incremental mutation.
 */
export function recomputeProblemState(
  attemptsChronological: AttemptStateInput[]
): RecomputedProblemState {
  if (attemptsChronological.length === 0) {
    return {
      lastClassification: null,
      lastAttemptAt: null,
      intervalDays: null,
      consecutiveIndependent: 0,
      nextRevisionDate: null,
    };
  }

  const sorted = [...attemptsChronological].sort((a, b) => {
    const ta = new Date(a.attemptedAt).getTime();
    const tb = new Date(b.attemptedAt).getTime();
    if (ta !== tb) return ta - tb;
    return dsaDateStr(a.attemptDate).localeCompare(dsaDateStr(b.attemptDate));
  });

  let consecutiveIndependent = 0;
  let intervalDays = 1;
  let lastClassification: DsaClassificationValue = sorted[0].classification;
  let lastAttemptAt = new Date(sorted[0].attemptedAt);
  let nextRevisionDate = dsaDateStr(sorted[0].attemptDate);

  for (const attempt of sorted) {
    const step = getIntervalForStep(attempt.classification, consecutiveIndependent);
    consecutiveIndependent = step.consecutiveIndependent;
    intervalDays = step.intervalDays;
    lastClassification = attempt.classification;
    lastAttemptAt = new Date(attempt.attemptedAt);
    nextRevisionDate = addDaysToDateStr(dsaDateStr(attempt.attemptDate), intervalDays);
  }

  return {
    lastClassification,
    lastAttemptAt,
    intervalDays,
    consecutiveIndependent,
    nextRevisionDate,
  };
}

/**
 * Derived failure count: number of editorial or not_understood attempts.
 */
export function computeFailureCount(
  attempts: Array<{ classification: DsaClassificationValue }>
): number {
  let count = 0;
  for (const a of attempts) {
    if (a.classification === "editorial" || a.classification === "not_understood") {
      count++;
    }
  }
  return count;
}

/**
 * Effective revision date respects manual override until cleared by a newer attempt.
 */
export function getEffectiveRevisionDate(problem: {
  nextRevisionDate: Date | string | null;
  manualNextRevisionDate: Date | string | null;
}): string | null {
  if (problem.manualNextRevisionDate) {
    return dsaDateStr(problem.manualNextRevisionDate);
  }
  if (problem.nextRevisionDate) {
    return dsaDateStr(problem.nextRevisionDate);
  }
  return null;
}

export interface RevisionQueueInputProblem {
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
}

export interface RevisionQueueItem {
  id: string;
  topicId: string;
  topicName: string;
  subtopic: string;
  title: string;
  difficulty: DsaDifficultyValue | null;
  sourceUrl: string;
  lastClassification: DsaClassificationValue | null;
  intervalDays: number | null;
  consecutiveIndependent: number;
  nextRevisionDate: string | null;
  manualNextRevisionDate: string | null;
  effectiveRevisionDate: string | null;
  daysOverdue: number;
  failureCount: number;
  lastRevisedDate: string | null;
}

export interface RevisionQueueSections {
  overdue: RevisionQueueItem[];
  dueToday: RevisionQueueItem[];
  next7Days: RevisionQueueItem[];
  recentlyRevised: RevisionQueueItem[];
}

function getSeverityRank(classification: DsaClassificationValue | null): number {
  if (!classification) return 0;
  return CLASSIFICATION_META[classification].severityRank;
}

function compareDueItems(a: RevisionQueueItem, b: RevisionQueueItem): number {
  if (a.failureCount !== b.failureCount) {
    return b.failureCount - a.failureCount;
  }
  if (a.daysOverdue !== b.daysOverdue) {
    return b.daysOverdue - a.daysOverdue;
  }
  const sevA = getSeverityRank(a.lastClassification);
  const sevB = getSeverityRank(b.lastClassification);
  if (sevA !== sevB) {
    return sevB - sevA;
  }
  return a.title.localeCompare(b.title);
}

/**
 * Pure queue builder partitioning problems into Overdue, Due today, Next 7 days,
 * and Recently revised (last 7 days), sorted deterministically.
 */
export function buildRevisionQueue(
  problems: RevisionQueueInputProblem[],
  todayStr: string
): RevisionQueueSections {
  const next7End = addDaysToDateStr(todayStr, 7);
  const recent7Start = addDaysToDateStr(todayStr, -7);

  const overdue: RevisionQueueItem[] = [];
  const dueToday: RevisionQueueItem[] = [];
  const next7Days: RevisionQueueItem[] = [];
  const recentlyRevised: RevisionQueueItem[] = [];

  for (const p of problems) {
    if (p.archived) continue;

    const nextRev = p.nextRevisionDate ? dsaDateStr(p.nextRevisionDate) : null;
    const manualRev = p.manualNextRevisionDate ? dsaDateStr(p.manualNextRevisionDate) : null;
    const effRev = manualRev ?? nextRev;
    const failureCount = computeFailureCount(p.attempts);

    let lastRevisedDate: string | null = null;
    for (const a of p.attempts) {
      if (a.isRevision) {
        const dStr = dsaDateStr(a.attemptDate);
        if (!lastRevisedDate || dStr > lastRevisedDate) {
          lastRevisedDate = dStr;
        }
      }
    }

    const daysOverdue = effRev ? diffCalendarDays(todayStr, effRev) : 0;

    const item: RevisionQueueItem = {
      id: p.id,
      topicId: p.topicId,
      topicName: p.topicName,
      subtopic: p.subtopic,
      title: p.title,
      difficulty: p.difficulty,
      sourceUrl: p.sourceUrl,
      lastClassification: p.lastClassification,
      intervalDays: p.intervalDays,
      consecutiveIndependent: p.consecutiveIndependent,
      nextRevisionDate: nextRev,
      manualNextRevisionDate: manualRev,
      effectiveRevisionDate: effRev,
      daysOverdue,
      failureCount,
      lastRevisedDate,
    };

    if (effRev) {
      if (effRev < todayStr) {
        overdue.push(item);
      } else if (effRev === todayStr) {
        dueToday.push(item);
      } else if (effRev > todayStr && effRev <= next7End) {
        next7Days.push(item);
      }
    }

    if (lastRevisedDate && lastRevisedDate >= recent7Start && lastRevisedDate <= todayStr) {
      recentlyRevised.push(item);
    }
  }

  overdue.sort(compareDueItems);
  dueToday.sort(compareDueItems);
  next7Days.sort((a, b) => {
    const da = a.effectiveRevisionDate ?? "";
    const db = b.effectiveRevisionDate ?? "";
    if (da !== db) return da.localeCompare(db);
    return compareDueItems(a, b);
  });
  recentlyRevised.sort((a, b) => {
    const da = a.lastRevisedDate ?? "";
    const db = b.lastRevisedDate ?? "";
    if (da !== db) return db.localeCompare(da);
    return a.title.localeCompare(b.title);
  });

  return {
    overdue,
    dueToday,
    next7Days,
    recentlyRevised,
  };
}
