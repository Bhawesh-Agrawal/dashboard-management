import { addDaysToDateStr, dsaDateStr } from "./time";
import type { DsaClassificationValue } from "./schemas";

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
