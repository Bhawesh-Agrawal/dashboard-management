import { dsaDateStr } from "./time";
import type {
  DsaClassificationValue,
  DsaPhase,
  DsaTopicStatusValue,
} from "./schemas";

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

export interface DerivedSessionCounts {
  attempted: number;
  solvedIndependently: number;
  needingHelp: number;
  notUnderstood: number;
  topicsPractised: string[];
}

/**
 * Pure computation of derived session counts and topics practised from linked attempts.
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

export function resolveCurrentPhase(phases: DsaPhase[], programmeDay: number): string | null {
  if (!phases || phases.length === 0) return null;
  const sorted = [...phases].sort((a, b) => b.startDay - a.startDay);
  const match = sorted.find((p) => p.startDay <= programmeDay);
  return match ? match.name : null;
}
