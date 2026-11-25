import { CLASSIFICATION_META, HELP_TYPE_LABELS, TOPIC_STATUS_LABELS } from "./constants";
import { resolveCurrentPhase } from "./dashboard";
import { buildRevisionQueue, computeFailureCount } from "./revision";
import { deriveSessionMetrics } from "./sessions";
import { addDaysToDateStr, diffCalendarDays, dsaDateStr } from "./time";
import { computeTopicsOverview } from "./topics";
import {
  DSA_CLASSIFICATIONS,
  type DsaClassificationValue,
  type DsaContestPlatformValue,
  type DsaDifficultyValue,
  type DsaHelpTypeValue,
  type DsaPhase,
  type DsaTopicStatusValue,
} from "./schemas";

export const TUTOR_REPORT_SCHEMA_VERSION = "1.0.0";
export const TUTOR_REPORT_CHAR_WARN_THRESHOLD = 30_000;

export interface TutorReportOptions {
  windowDays: 7 | 14 | 30;
  includeFullHistory: boolean;
  nextSessionMinutes: number | null;
  tutorNote: string;
}

export interface TutorReportSourceInput {
  generatedAtIso: string;
  todayStr: string;
  timezone: string;
  settings: {
    programmeStartDate: string;
    programmeLengthDays: number;
    phases: DsaPhase[];
    currentTopicId: string | null;
  } | null;
  topics: Array<{
    id: string;
    name: string;
    order: number;
    status: DsaTopicStatusValue;
  }>;
  problems: Array<{
    id: string;
    topicId: string;
    topicName: string;
    subtopic: string;
    title: string;
    difficulty: DsaDifficultyValue | null;
    archived: boolean;
    lastClassification: DsaClassificationValue | null;
    intervalDays: number | null;
    consecutiveIndependent: number;
    nextRevisionDate: string | null;
    manualNextRevisionDate: string | null;
    attempts: Array<{
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
    }>;
  }>;
  sessions: Array<{
    date: string;
    durationMin: number | null;
    observations: string | null;
    nextSessionAvailabilityMin: number | null;
    nextSessionNote: string | null;
    attempts: Array<{
      classification: DsaClassificationValue;
      topicName: string;
    }>;
  }>;
  contests: Array<{
    platform: DsaContestPlatformValue;
    name: string;
    date: string;
    problemsAttempted: number;
    problemsSolved: number;
    rankOrRating: string | null;
    upsolveProblems: string | null;
    conceptsMissed: string | null;
  }>;
}

export interface TutorReportData {
  schemaVersion: string;
  snapshot: {
    generatedAt: string;
    programmeDay: number;
    programmeLengthDays: number;
    currentPhase: string | null;
    currentTopic: string | null;
    timezone: string;
  };
  legend: Array<{
    classification: DsaClassificationValue;
    label: string;
    description: string;
    intervalRule: string;
  }>;
  topics: Array<{
    order: number;
    name: string;
    status: string;
    totalProblems: number;
    attemptedProblems: number;
    classificationCounts: Record<DsaClassificationValue, number>;
    overdueCount: number;
    readinessIndependentPercent: number;
    readinessFailures14d: number;
  }>;
  currentTopicProblems: Array<{
    title: string;
    subtopic: string;
    difficulty: DsaDifficultyValue | null;
    latestClassification: DsaClassificationValue | null;
  }>;
  revision: {
    overdue: Array<{
      title: string;
      topic: string;
      lastClassification: DsaClassificationValue | null;
      failureCount: number;
      dueDate: string | null;
    }>;
    dueToday: Array<{
      title: string;
      topic: string;
      lastClassification: DsaClassificationValue | null;
      failureCount: number;
      dueDate: string | null;
    }>;
    next7Days: Array<{
      title: string;
      topic: string;
      lastClassification: DsaClassificationValue | null;
      failureCount: number;
      dueDate: string | null;
    }>;
  };
  recentSessions: Array<{
    date: string;
    durationMin: number | null;
    attempted: number;
    solvedIndependently: number;
    needingHelp: number;
    notUnderstood: number;
    topicsPractised: string[];
    observations: string | null;
  }>;
  attemptHistory: Array<{
    title: string;
    topic: string;
    attempts: Array<{
      date: string;
      classification: DsaClassificationValue;
      timeSpentMin: number;
      confidence: number;
      isRevision: boolean;
      helpType: DsaHelpTypeValue;
      mistakeTags: string[];
      mistakes: string | null;
      observation: string | null;
      initialApproach: string | null;
      finalApproach: string | null;
      timeComplexity: string | null;
      spaceComplexity: string | null;
    }>;
  }>;
  recurringMistakes: {
    overall: Array<{ tag: string; count: number }>;
    byTopic: Array<{ topic: string; tags: Array<{ tag: string; count: number }> }>;
  };
  weakConcepts: {
    topicsByFailureRatio: Array<{
      topic: string;
      failedAttempts: number;
      totalAttempts: number;
      failureRatio: number;
    }>;
    subtopicsByFailureRatio: Array<{
      topic: string;
      subtopic: string;
      failedAttempts: number;
      totalAttempts: number;
      failureRatio: number;
    }>;
    repeatedFailureProblems: Array<{
      title: string;
      topic: string;
      failureCount: number;
      latestClassification: DsaClassificationValue | null;
    }>;
    lowConfidenceProblems: Array<{
      title: string;
      topic: string;
      latestConfidence: number;
      latestClassification: DsaClassificationValue | null;
    }>;
  };
  contests: Array<{
    date: string;
    platform: DsaContestPlatformValue;
    name: string;
    problemsAttempted: number;
    problemsSolved: number;
    rankOrRating: string | null;
    upsolveProblems: string | null;
    conceptsMissed: string | null;
  }>;
  availability: {
    nextSessionMinutes: number | null;
    tutorNote: string | null;
  };
}

function truncate200(text: string | null | undefined): string | null {
  if (!text) return null;
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (!cleaned) return null;
  if (cleaned.length <= 200) return cleaned;
  return `${cleaned.slice(0, 197)}...`;
}

export function buildTutorReportData(
  source: TutorReportSourceInput,
  options: TutorReportOptions
): TutorReportData {
  const startDateStr = source.settings?.programmeStartDate ?? source.todayStr;
  const programmeLengthDays = source.settings?.programmeLengthDays ?? 90;
  const rawDay = diffCalendarDays(source.todayStr, startDateStr) + 1;
  const programmeDay = Math.min(programmeLengthDays, Math.max(1, rawDay));
  const currentPhase = source.settings
    ? resolveCurrentPhase(source.settings.phases, programmeDay)
    : null;

  const currentTopicRow =
    (source.settings?.currentTopicId
      ? source.topics.find((t) => t.id === source.settings?.currentTopicId)
      : undefined) ??
    source.topics[0] ??
    null;

  // 2. Legend
  const legend = DSA_CLASSIFICATIONS.map((c) => ({
    classification: c,
    label: CLASSIFICATION_META[c].label,
    description: CLASSIFICATION_META[c].description,
    intervalRule: CLASSIFICATION_META[c].intervalLabel,
  }));

  // 3. Topics table
  const fourteenDaysAgo = addDaysToDateStr(source.todayStr, -14);
  const recentFailedProblemIds = new Set<string>();
  for (const p of source.problems) {
    if (p.archived) continue;
    for (const a of p.attempts) {
      if (
        a.attemptDate >= fourteenDaysAgo &&
        (a.classification === "editorial" || a.classification === "not_understood")
      ) {
        recentFailedProblemIds.add(p.id);
      }
    }
  }

  const topicsOverview = computeTopicsOverview({
    topics: source.topics,
    problems: source.problems.map((p) => ({
      id: p.id,
      topicId: p.topicId,
      archived: p.archived,
      lastClassification: p.lastClassification,
      nextRevisionDate: p.nextRevisionDate,
      manualNextRevisionDate: p.manualNextRevisionDate,
    })),
    recentFailedProblemIds,
    currentTopicId: currentTopicRow?.id ?? null,
    todayStr: source.todayStr,
  });

  // 4. Current topic problems
  const currentTopicProblems = currentTopicRow
    ? source.problems
        .filter((p) => !p.archived && p.topicId === currentTopicRow.id)
        .map((p) => ({
          title: p.title,
          subtopic: p.subtopic,
          difficulty: p.difficulty,
          latestClassification: p.lastClassification,
        }))
    : [];

  // 5. Revision section
  const queue = buildRevisionQueue(
    source.problems.map((p) => ({
      id: p.id,
      topicId: p.topicId,
      topicName: p.topicName,
      subtopic: p.subtopic,
      title: p.title,
      difficulty: p.difficulty,
      sourceUrl: "",
      archived: p.archived,
      lastClassification: p.lastClassification,
      intervalDays: p.intervalDays,
      consecutiveIndependent: p.consecutiveIndependent,
      nextRevisionDate: p.nextRevisionDate,
      manualNextRevisionDate: p.manualNextRevisionDate,
      attempts: p.attempts.map((a) => ({
        attemptDate: a.attemptDate,
        classification: a.classification,
        isRevision: a.isRevision,
      })),
    })),
    source.todayStr
  );

  const mapQueueItem = (i: (typeof queue.overdue)[number]) => ({
    title: i.title,
    topic: i.topicName,
    lastClassification: i.lastClassification,
    failureCount: i.failureCount,
    dueDate: i.effectiveRevisionDate,
  });

  // 6. Recent sessions within window
  const windowStartStr = addDaysToDateStr(source.todayStr, -(options.windowDays - 1));
  const recentSessions = source.sessions
    .filter((s) => s.date >= windowStartStr && s.date <= source.todayStr)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((s) => {
      const derived = deriveSessionMetrics(s.attempts);
      return {
        date: s.date,
        durationMin: s.durationMin,
        attempted: derived.attempted,
        solvedIndependently: derived.solvedIndependently,
        needingHelp: derived.needingHelp,
        notUnderstood: derived.notUnderstood,
        topicsPractised: derived.topicsPractised,
        observations: truncate200(s.observations),
      };
    });

  // 7. Attempt history per problem touched in window
  const attemptHistory: TutorReportData["attemptHistory"] = [];
  for (const p of source.problems) {
    const touchedInWindow = p.attempts.some(
      (a) => a.attemptDate >= windowStartStr && a.attemptDate <= source.todayStr
    );
    if (!touchedInWindow) continue;

    const sortedAttempts = [...p.attempts].sort((a, b) =>
      a.attemptedAt.localeCompare(b.attemptedAt)
    );
    const chosen = options.includeFullHistory
      ? sortedAttempts
      : sortedAttempts.slice(-1);

    attemptHistory.push({
      title: p.title,
      topic: p.topicName,
      attempts: chosen.map((a) => ({
        date: a.attemptDate,
        classification: a.classification,
        timeSpentMin: a.timeSpentMin,
        confidence: a.confidence,
        isRevision: a.isRevision,
        helpType: a.helpType,
        mistakeTags: a.mistakeTags,
        mistakes: truncate200(a.mistakes),
        observation: truncate200(a.observation),
        initialApproach: a.initialApproach?.trim() || null,
        finalApproach: a.finalApproach?.trim() || null,
        timeComplexity: a.timeComplexity?.trim() || null,
        spaceComplexity: a.spaceComplexity?.trim() || null,
      })),
    });
  }

  // 8. Recurring mistakes (last 30 days)
  const thirtyDaysAgo = addDaysToDateStr(source.todayStr, -30);
  const overallTagCounts = new Map<string, number>();
  const topicTagCounts = new Map<string, Map<string, number>>();

  // 9. Weak concepts
  const topicFailureStats = new Map<string, { failed: number; total: number }>();
  const subtopicFailureStats = new Map<
    string,
    { topic: string; subtopic: string; failed: number; total: number }
  >();
  const repeatedFailureProblems: TutorReportData["weakConcepts"]["repeatedFailureProblems"] =
    [];
  const lowConfidenceProblems: TutorReportData["weakConcepts"]["lowConfidenceProblems"] = [];

  for (const p of source.problems) {
    if (p.archived) continue;

    for (const a of p.attempts) {
      if (a.attemptDate >= thirtyDaysAgo && a.attemptDate <= source.todayStr) {
        for (const tag of a.mistakeTags) {
          overallTagCounts.set(tag, (overallTagCounts.get(tag) ?? 0) + 1);
          const tMap = topicTagCounts.get(p.topicName) ?? new Map<string, number>();
          tMap.set(tag, (tMap.get(tag) ?? 0) + 1);
          topicTagCounts.set(p.topicName, tMap);
        }
      }

      const isFail =
        a.classification === "editorial" || a.classification === "not_understood";
      const tStat = topicFailureStats.get(p.topicName) ?? { failed: 0, total: 0 };
      tStat.total++;
      if (isFail) tStat.failed++;
      topicFailureStats.set(p.topicName, tStat);

      if (p.subtopic) {
        const subKey = `${p.topicName}::${p.subtopic}`;
        const stStat = subtopicFailureStats.get(subKey) ?? {
          topic: p.topicName,
          subtopic: p.subtopic,
          failed: 0,
          total: 0,
        };
        stStat.total++;
        if (isFail) stStat.failed++;
        subtopicFailureStats.set(subKey, stStat);
      }
    }

    const failCount = computeFailureCount(p.attempts);
    if (failCount >= 2) {
      repeatedFailureProblems.push({
        title: p.title,
        topic: p.topicName,
        failureCount: failCount,
        latestClassification: p.lastClassification,
      });
    }

    if (p.attempts.length > 0) {
      const sorted = [...p.attempts].sort((a, b) =>
        a.attemptedAt.localeCompare(b.attemptedAt)
      );
      const latest = sorted[sorted.length - 1];
      if (latest.confidence <= 2) {
        lowConfidenceProblems.push({
          title: p.title,
          topic: p.topicName,
          latestConfidence: latest.confidence,
          latestClassification: latest.classification,
        });
      }
    }
  }

  const overallMistakes = Array.from(overallTagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

  const byTopicMistakes = Array.from(topicTagCounts.entries())
    .map(([topic, map]) => ({
      topic,
      tags: Array.from(map.entries())
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)),
    }))
    .sort((a, b) => a.topic.localeCompare(b.topic));

  const topicsByFailureRatio = Array.from(topicFailureStats.entries())
    .filter(([, s]) => s.failed > 0)
    .map(([topic, s]) => ({
      topic,
      failedAttempts: s.failed,
      totalAttempts: s.total,
      failureRatio: Number((s.failed / s.total).toFixed(2)),
    }))
    .sort((a, b) => b.failureRatio - a.failureRatio || b.failedAttempts - a.failedAttempts);

  const subtopicsByFailureRatio = Array.from(subtopicFailureStats.values())
    .filter((s) => s.failed > 0)
    .map((s) => ({
      topic: s.topic,
      subtopic: s.subtopic,
      failedAttempts: s.failed,
      totalAttempts: s.total,
      failureRatio: Number((s.failed / s.total).toFixed(2)),
    }))
    .sort((a, b) => b.failureRatio - a.failureRatio || b.failedAttempts - a.failedAttempts);

  repeatedFailureProblems.sort((a, b) => b.failureCount - a.failureCount);
  lowConfidenceProblems.sort((a, b) => a.latestConfidence - b.latestConfidence);

  // 10. Contests (last 5)
  const contests = [...source.contests]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  return {
    schemaVersion: TUTOR_REPORT_SCHEMA_VERSION,
    snapshot: {
      generatedAt: source.generatedAtIso,
      programmeDay,
      programmeLengthDays,
      currentPhase,
      currentTopic: currentTopicRow?.name ?? null,
      timezone: source.timezone,
    },
    legend,
    topics: topicsOverview.topics.map((t) => ({
      order: t.order,
      name: t.name,
      status: TOPIC_STATUS_LABELS[t.status],
      totalProblems: t.totalProblems,
      attemptedProblems: t.attemptedProblems,
      classificationCounts: t.classificationCounts,
      overdueCount: t.overdueCount,
      readinessIndependentPercent: t.readinessEvidence.independentPercent,
      readinessFailures14d: t.readinessEvidence.failuresLast14Days,
    })),
    currentTopicProblems,
    revision: {
      overdue: queue.overdue.map(mapQueueItem),
      dueToday: queue.dueToday.map(mapQueueItem),
      next7Days: queue.next7Days.map(mapQueueItem),
    },
    recentSessions,
    attemptHistory,
    recurringMistakes: {
      overall: overallMistakes,
      byTopic: byTopicMistakes,
    },
    weakConcepts: {
      topicsByFailureRatio,
      subtopicsByFailureRatio,
      repeatedFailureProblems,
      lowConfidenceProblems,
    },
    contests,
    availability: {
      nextSessionMinutes: options.nextSessionMinutes,
      tutorNote: options.tutorNote.trim() || null,
    },
  };
}

export function formatTutorReportMarkdown(data: TutorReportData): string {
  const lines: string[] = [];

  lines.push("# DSA Progress Report");
  lines.push("");

  // 1. Snapshot
  lines.push("## 1. Snapshot");
  lines.push(`- Generated at: ${data.snapshot.generatedAt}`);
  lines.push(
    `- Programme Day: ${data.snapshot.programmeDay} of ${data.snapshot.programmeLengthDays}`
  );
  lines.push(`- Current Phase: ${data.snapshot.currentPhase ?? "None"}`);
  lines.push(`- Current Topic: ${data.snapshot.currentTopic ?? "None"}`);
  lines.push(`- Timezone: ${data.snapshot.timezone}`);
  lines.push("");

  // 2. Legend
  lines.push("## 2. Classification & Revision Legend");
  for (const item of data.legend) {
    lines.push(
      `- **${item.classification}** (${item.label}): ${item.description} Interval: ${item.intervalRule}.`
    );
  }
  lines.push("");

  // 3. Topics Table
  lines.push("## 3. Topics Overview");
  if (data.topics.length === 0) {
    lines.push("_No topics._");
  } else {
    lines.push(
      "| # | Topic | Status | Attempted/Total | Indep | Effort | Hinted | Ed | NotUnd | Overdue | 14d Fails |"
    );
    lines.push("|---|-------|--------|-----------------|-------|--------|--------|----|--------|---------|-----------|");
    for (const t of data.topics) {
      const c = t.classificationCounts;
      lines.push(
        `| ${t.order} | ${t.name} | ${t.status} | ${t.attemptedProblems}/${t.totalProblems} | ${c.independent} | ${c.effortful} | ${c.hinted} | ${c.editorial} | ${c.not_understood} | ${t.overdueCount} | ${t.readinessFailures14d} |`
      );
    }
  }
  lines.push("");

  // 4. Current Topic Problems
  lines.push(
    `## 4. Current Topic Problems (${data.snapshot.currentTopic ?? "None"})`
  );
  if (data.currentTopicProblems.length === 0) {
    lines.push("_No problems in current topic._");
  } else {
    for (const p of data.currentTopicProblems) {
      const sub = p.subtopic ? ` [${p.subtopic}]` : "";
      const diff = p.difficulty ? ` (${p.difficulty})` : "";
      const cls = p.latestClassification ?? "not_attempted";
      lines.push(`- ${p.title}${sub}${diff} — ${cls}`);
    }
  }
  lines.push("");

  // 5. Revision Queue
  lines.push("## 5. Revision Queue");
  const appendRevGroup = (
    heading: string,
    items: TutorReportData["revision"]["overdue"]
  ) => {
    lines.push(`### ${heading} (${items.length})`);
    if (items.length === 0) {
      lines.push("- None");
    } else {
      for (const item of items) {
        lines.push(
          `- ${item.title} (${item.topic}) — last: ${item.lastClassification ?? "none"}, failures: ${item.failureCount}, due: ${item.dueDate ?? "—"}`
        );
      }
    }
  };
  appendRevGroup("Overdue", data.revision.overdue);
  appendRevGroup("Due Today", data.revision.dueToday);
  appendRevGroup("Next 7 Days", data.revision.next7Days);
  lines.push("");

  // 6. Recent Sessions
  lines.push("## 6. Recent Sessions");
  if (data.recentSessions.length === 0) {
    lines.push("_No sessions in window._");
  } else {
    for (const s of data.recentSessions) {
      const dur = s.durationMin != null ? `${s.durationMin}m` : "—";
      const topics =
        s.topicsPractised.length > 0 ? s.topicsPractised.join(", ") : "none";
      const obs = s.observations ? ` | Notes: ${s.observations}` : "";
      lines.push(
        `- ${s.date} (${dur}): ${s.attempted} attempted (${s.solvedIndependently} indep, ${s.needingHelp} help, ${s.notUnderstood} not_understood) | Topics: ${topics}${obs}`
      );
    }
  }
  lines.push("");

  // 7. Attempt History per Problem
  lines.push("## 7. Attempt History (Problems Touched in Window)");
  if (data.attemptHistory.length === 0) {
    lines.push("_No attempts in window._");
  } else {
    for (const entry of data.attemptHistory) {
      lines.push(`### ${entry.title} (${entry.topic})`);
      for (const a of entry.attempts) {
        const parts = [
          a.date,
          a.classification,
          `${a.timeSpentMin}m`,
          `conf ${a.confidence}/5`,
          `help: ${HELP_TYPE_LABELS[a.helpType]}`,
        ];
        if (a.isRevision) parts.push("revision");
        if (a.mistakeTags.length > 0) {
          parts.push(`tags: [${a.mistakeTags.join(", ")}]`);
        }
        if (a.mistakes) parts.push(`mistakes: "${a.mistakes}"`);
        if (a.observation) parts.push(`obs: "${a.observation}"`);
        if (a.initialApproach) parts.push(`initial: "${a.initialApproach}"`);
        if (a.finalApproach) parts.push(`final: "${a.finalApproach}"`);
        if (a.timeComplexity) parts.push(`T=${a.timeComplexity}`);
        if (a.spaceComplexity) parts.push(`S=${a.spaceComplexity}`);
        lines.push(`- ${parts.join(" | ")}`);
      }
    }
  }
  lines.push("");

  // 8. Recurring Mistakes (last 30d)
  lines.push("## 8. Recurring Mistakes (Last 30 Days)");
  if (data.recurringMistakes.overall.length === 0) {
    lines.push("_No mistake tags recorded in last 30 days._");
  } else {
    lines.push(
      `- Overall: ${data.recurringMistakes.overall
        .map((m) => `${m.tag} (${m.count})`)
        .join(", ")}`
    );
    for (const t of data.recurringMistakes.byTopic) {
      lines.push(
        `- ${t.topic}: ${t.tags.map((m) => `${m.tag} (${m.count})`).join(", ")}`
      );
    }
  }
  lines.push("");

  // 9. Weak Concepts
  lines.push("## 9. Weak Concepts");
  lines.push("### Topics by Failure Ratio");
  if (data.weakConcepts.topicsByFailureRatio.length === 0) {
    lines.push("- None");
  } else {
    for (const t of data.weakConcepts.topicsByFailureRatio) {
      lines.push(
        `- ${t.topic}: ${Math.round(t.failureRatio * 100)}% (${t.failedAttempts}/${t.totalAttempts} attempts)`
      );
    }
  }
  lines.push("### Subtopics by Failure Ratio");
  if (data.weakConcepts.subtopicsByFailureRatio.length === 0) {
    lines.push("- None");
  } else {
    for (const s of data.weakConcepts.subtopicsByFailureRatio) {
      lines.push(
        `- ${s.topic} / ${s.subtopic}: ${Math.round(s.failureRatio * 100)}% (${s.failedAttempts}/${s.totalAttempts})`
      );
    }
  }
  lines.push("### Problems with Failures >= 2");
  if (data.weakConcepts.repeatedFailureProblems.length === 0) {
    lines.push("- None");
  } else {
    for (const p of data.weakConcepts.repeatedFailureProblems) {
      lines.push(
        `- ${p.title} (${p.topic}) — ${p.failureCount} fails, latest: ${p.latestClassification ?? "none"}`
      );
    }
  }
  lines.push("### Low-Confidence Problems (<= 2/5)");
  if (data.weakConcepts.lowConfidenceProblems.length === 0) {
    lines.push("- None");
  } else {
    for (const p of data.weakConcepts.lowConfidenceProblems) {
      lines.push(
        `- ${p.title} (${p.topic}) — conf ${p.latestConfidence}/5, latest: ${p.latestClassification ?? "none"}`
      );
    }
  }
  lines.push("");

  // 10. Contests
  lines.push("## 10. Recent Contests (Last 5)");
  if (data.contests.length === 0) {
    lines.push("_No contests recorded._");
  } else {
    for (const c of data.contests) {
      const rank = c.rankOrRating ? ` | Rank/Rating: ${c.rankOrRating}` : "";
      const upsolve = c.upsolveProblems ? ` | Upsolve: ${c.upsolveProblems}` : "";
      const missed = c.conceptsMissed ? ` | Missed: ${c.conceptsMissed}` : "";
      lines.push(
        `- ${c.date} [${c.platform}] ${c.name}: ${c.problemsSolved}/${c.problemsAttempted} solved${rank}${upsolve}${missed}`
      );
    }
  }
  lines.push("");

  // 11. Availability
  lines.push("## 11. Availability & Note for Tutor");
  lines.push(
    `- Available time for next session: ${
      data.availability.nextSessionMinutes != null
        ? `${data.availability.nextSessionMinutes} minutes`
        : "Not specified"
    }`
  );
  if (data.availability.tutorNote) {
    lines.push(`- Note: ${data.availability.tutorNote}`);
  }

  return lines.join("\n");
}

export function formatTutorReportJson(data: TutorReportData): string {
  return JSON.stringify(data, null, 2);
}

export function isReportOverSizeThreshold(text: string): boolean {
  return text.length > TUTOR_REPORT_CHAR_WARN_THRESHOLD;
}

/**
 * Helper to convert Prisma rows into TutorReportSourceInput (without personal identifiers).
 */
export function normalizeReportDates(input: {
  now: Date;
  todayStr: string;
  timezone: string;
  settings: {
    programmeStartDate: Date;
    programmeLengthDays: number;
    phases: unknown;
    currentTopicId: string | null;
  } | null;
  topics: Array<{
    id: string;
    name: string;
    order: number;
    status: DsaTopicStatusValue;
  }>;
  problems: Array<{
    id: string;
    topicId: string;
    topic: { name: string };
    subtopic: string;
    title: string;
    difficulty: DsaDifficultyValue | null;
    archived: boolean;
    lastClassification: DsaClassificationValue | null;
    intervalDays: number | null;
    consecutiveIndependent: number;
    nextRevisionDate: Date | null;
    manualNextRevisionDate: Date | null;
    attempts: Array<{
      id: string;
      attemptedAt: Date;
      attemptDate: Date;
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
    }>;
  }>;
  sessions: Array<{
    date: Date;
    durationMin: number | null;
    observations: string | null;
    nextSessionAvailabilityMin: number | null;
    nextSessionNote: string | null;
    attempts: Array<{
      classification: DsaClassificationValue;
      problem: { topic: { name: string } };
    }>;
  }>;
  contests: Array<{
    platform: DsaContestPlatformValue;
    name: string;
    date: Date;
    problemsAttempted: number;
    problemsSolved: number;
    rankOrRating: string | null;
    upsolveProblems: string | null;
    conceptsMissed: string | null;
  }>;
}): TutorReportSourceInput {
  return {
    generatedAtIso: input.now.toISOString(),
    todayStr: input.todayStr,
    timezone: input.timezone,
    settings: input.settings
      ? {
          programmeStartDate: dsaDateStr(input.settings.programmeStartDate),
          programmeLengthDays: input.settings.programmeLengthDays,
          phases: Array.isArray(input.settings.phases)
            ? (input.settings.phases as DsaPhase[])
            : [],
          currentTopicId: input.settings.currentTopicId,
        }
      : null,
    topics: input.topics,
    problems: input.problems.map((p) => ({
      id: p.id,
      topicId: p.topicId,
      topicName: p.topic.name,
      subtopic: p.subtopic,
      title: p.title,
      difficulty: p.difficulty,
      archived: p.archived,
      lastClassification: p.lastClassification,
      intervalDays: p.intervalDays,
      consecutiveIndependent: p.consecutiveIndependent,
      nextRevisionDate: p.nextRevisionDate ? dsaDateStr(p.nextRevisionDate) : null,
      manualNextRevisionDate: p.manualNextRevisionDate
        ? dsaDateStr(p.manualNextRevisionDate)
        : null,
      attempts: p.attempts.map((a) => ({
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
      })),
    })),
    sessions: input.sessions.map((s) => ({
      date: dsaDateStr(s.date),
      durationMin: s.durationMin,
      observations: s.observations,
      nextSessionAvailabilityMin: s.nextSessionAvailabilityMin,
      nextSessionNote: s.nextSessionNote,
      attempts: s.attempts.map((a) => ({
        classification: a.classification,
        topicName: a.problem.topic.name,
      })),
    })),
    contests: input.contests.map((c) => ({
      platform: c.platform,
      name: c.name,
      date: dsaDateStr(c.date),
      problemsAttempted: c.problemsAttempted,
      problemsSolved: c.problemsSolved,
      rankOrRating: c.rankOrRating,
      upsolveProblems: c.upsolveProblems,
      conceptsMissed: c.conceptsMissed,
    })),
  };
}
