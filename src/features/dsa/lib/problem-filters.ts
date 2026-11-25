import { addDaysToDateStr } from "./time";
import type { DsaClassificationValue, DsaDifficultyValue } from "./schemas";

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
 * Pure filtering logic for the DSA problem bank (client-safe).
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
