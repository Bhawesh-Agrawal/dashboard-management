import { prisma } from "@/lib/prisma";
import { getNow } from "@/lib/clock";
import { requireDsaUserId } from "./ownership";
import { computeFailureCount, getEffectiveRevisionDate } from "./revision";
import {
  addDaysToDateStr,
  diffCalendarDays,
  dsaDateStr,
  dsaToday,
  getWeekStartMonday,
  DSA_DEFAULT_TIMEZONE,
} from "./time";
import type {
  DsaClassificationValue,
  DsaDifficultyValue,
  DsaPhase,
  DsaTopicStatusValue,
} from "./schemas";

export interface DashboardInput {
  now: Date;
  todayStr: string;
  settings: {
    programmeStartDate: Date | string;
    programmeLengthDays: number;
    phases: DsaPhase[];
    currentTopicId: string | null;
    lastBackupAt: Date | null;
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
    sourceUrl: string;
    orderInTopic: number;
    archived: boolean;
    lastClassification: DsaClassificationValue | null;
    nextRevisionDate: Date | string | null;
    manualNextRevisionDate: Date | string | null;
    attempts: Array<{
      classification: DsaClassificationValue;
    }>;
  }>;
  sessions: Array<{
    date: Date | string;
    hasActivity: boolean;
  }>;
  recentAttempts: Array<{
    id: string;
    problemId: string;
    problemTitle: string;
    topicName: string;
    attemptDate: Date | string;
    classification: DsaClassificationValue;
    timeSpentMin: number;
    confidence: number;
    isRevision: boolean;
  }>;
}

export interface DsaDashboardData {
  todayStr: string;
  isFirstRun: boolean;
  hasSettings: boolean;
  hasBank: boolean;
  needsBackupBanner: boolean;
  lastBackupAt: string | null;
  programmeDay: number;
  programmeLengthDays: number;
  programmeStartDate: string;
  currentPhase: string | null;
  totals: {
    problems: number;
    attempted: number;
    independent: number;
  };
  studyToday: {
    currentTopic: { id: string; name: string } | null;
    nextProblems: Array<{
      id: string;
      title: string;
      subtopic: string;
      difficulty: DsaDifficultyValue | null;
      sourceUrl: string;
      orderInTopic: number;
    }>;
    dueTodayCount: number;
    overdueCount: number;
  };
  topicsSummary: {
    covered: number;
    inProgress: number;
    remaining: number;
    perTopic: Array<{
      id: string;
      name: string;
      order: number;
      status: DsaTopicStatusValue;
      attempted: number;
      total: number;
    }>;
  };
  struggling: {
    problems: Array<{
      id: string;
      title: string;
      topicName: string;
      lastClassification: DsaClassificationValue | null;
      failureCount: number;
    }>;
    topTopics: Array<{
      topicId: string;
      topicName: string;
      count: number;
    }>;
  };
  consistency: {
    sessionsThisWeek: number;
    last4Weeks: Array<{ weekStart: string; count: number }>;
    daysSinceLastSession: number | null;
  };
  recentActivity: Array<{
    id: string;
    problemId: string;
    problemTitle: string;
    topicName: string;
    attemptDate: string;
    classification: DsaClassificationValue;
    timeSpentMin: number;
    confidence: number;
    isRevision: boolean;
  }>;
}

export function resolveCurrentPhase(phases: DsaPhase[], programmeDay: number): string | null {
  if (!phases || phases.length === 0) return null;
  const sorted = [...phases].sort((a, b) => b.startDay - a.startDay);
  const match = sorted.find((p) => p.startDay <= programmeDay);
  return match ? match.name : null;
}

export function computeDsaDashboard(input: DashboardInput): DsaDashboardData {
  const nonArchived = input.problems.filter((p) => !p.archived);
  const hasSettings = input.settings !== null;
  const hasBank = nonArchived.length > 0;
  const isFirstRun = !hasSettings || !hasBank;

  const startDateStr = input.settings
    ? dsaDateStr(input.settings.programmeStartDate)
    : input.todayStr;
  const programmeLengthDays = input.settings?.programmeLengthDays ?? 90;
  const rawDay = diffCalendarDays(input.todayStr, startDateStr) + 1;
  const programmeDay = Math.min(programmeLengthDays, Math.max(1, rawDay));
  const currentPhase = input.settings
    ? resolveCurrentPhase(input.settings.phases, programmeDay)
    : null;

  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const lastBackupAt = input.settings?.lastBackupAt ?? null;
  const needsBackupBanner =
    hasBank &&
    (!lastBackupAt || input.now.getTime() - lastBackupAt.getTime() > sevenDaysMs);

  // Totals & Revision Counts & Struggling
  let attempted = 0;
  let independent = 0;
  let overdueCount = 0;
  let dueTodayCount = 0;

  const strugglingProblems: DsaDashboardData["struggling"]["problems"] = [];
  const strugglingByTopic = new Map<string, { topicId: string; topicName: string; count: number }>();

  const perTopicCounts = new Map<string, { attempted: number; total: number }>();
  for (const t of input.topics) {
    perTopicCounts.set(t.id, { attempted: 0, total: 0 });
  }

  for (const p of nonArchived) {
    const tEntry = perTopicCounts.get(p.topicId) ?? { attempted: 0, total: 0 };
    tEntry.total++;
    if (p.lastClassification) {
      attempted++;
      tEntry.attempted++;
      if (p.lastClassification === "independent") independent++;
    }
    perTopicCounts.set(p.topicId, tEntry);

    const effRev = getEffectiveRevisionDate(p);
    if (effRev) {
      if (effRev < input.todayStr) overdueCount++;
      else if (effRev === input.todayStr) dueTodayCount++;
    }

    const failureCount = computeFailureCount(p.attempts);
    const isStruggling =
      failureCount >= 2 ||
      p.lastClassification === "editorial" ||
      p.lastClassification === "not_understood";

    if (isStruggling) {
      strugglingProblems.push({
        id: p.id,
        title: p.title,
        topicName: p.topicName,
        lastClassification: p.lastClassification,
        failureCount,
      });
      const existing = strugglingByTopic.get(p.topicId) ?? {
        topicId: p.topicId,
        topicName: p.topicName,
        count: 0,
      };
      existing.count++;
      strugglingByTopic.set(p.topicId, existing);
    }
  }

  strugglingProblems.sort((a, b) => {
    if (b.failureCount !== a.failureCount) return b.failureCount - a.failureCount;
    return a.title.localeCompare(b.title);
  });

  const topTopics = Array.from(strugglingByTopic.values()).sort((a, b) => b.count - a.count);

  // Q1: Current topic and its next 3 not-yet-attempted problems in order
  const currentTopic =
    (input.settings?.currentTopicId
      ? input.topics.find((t) => t.id === input.settings?.currentTopicId)
      : undefined) ??
    input.topics[0] ??
    null;

  const nextProblems = currentTopic
    ? nonArchived
        .filter((p) => p.topicId === currentTopic.id && p.lastClassification === null)
        .sort((a, b) => a.orderInTopic - b.orderInTopic)
        .slice(0, 3)
        .map((p) => ({
          id: p.id,
          title: p.title,
          subtopic: p.subtopic,
          difficulty: p.difficulty,
          sourceUrl: p.sourceUrl,
          orderInTopic: p.orderInTopic,
        }))
    : [];

  // Q3: Topics summary
  let covered = 0;
  let inProgress = 0;
  let remaining = 0;
  const perTopic = input.topics.map((t) => {
    if (t.status === "practised" || t.status === "needs_revision" || t.status === "comfortable") {
      covered++;
    } else if (t.status === "in_progress") {
      inProgress++;
    } else {
      remaining++;
    }
    const counts = perTopicCounts.get(t.id) ?? { attempted: 0, total: 0 };
    return {
      id: t.id,
      name: t.name,
      order: t.order,
      status: t.status,
      attempted: counts.attempted,
      total: counts.total,
    };
  });

  // Q5: Consistency (Mon-Sun in owner's tz)
  const thisWeekStart = getWeekStartMonday(input.todayStr);
  const weekStarts = [
    addDaysToDateStr(thisWeekStart, -28),
    addDaysToDateStr(thisWeekStart, -21),
    addDaysToDateStr(thisWeekStart, -14),
    addDaysToDateStr(thisWeekStart, -7),
  ];

  const activeSessionDates = input.sessions
    .filter((s) => s.hasActivity)
    .map((s) => dsaDateStr(s.date))
    .sort((a, b) => b.localeCompare(a));

  const uniqueActiveDates = Array.from(new Set(activeSessionDates));
  const sessionsThisWeek = uniqueActiveDates.filter(
    (d) => d >= thisWeekStart && d <= addDaysToDateStr(thisWeekStart, 6)
  ).length;

  const last4Weeks = weekStarts.map((ws) => {
    const we = addDaysToDateStr(ws, 6);
    return {
      weekStart: ws,
      count: uniqueActiveDates.filter((d) => d >= ws && d <= we).length,
    };
  });

  const latestSessionDate = uniqueActiveDates[0] ?? null;
  const daysSinceLastSession = latestSessionDate
    ? Math.max(0, diffCalendarDays(input.todayStr, latestSessionDate))
    : null;

  return {
    todayStr: input.todayStr,
    isFirstRun,
    hasSettings,
    hasBank,
    needsBackupBanner,
    lastBackupAt: lastBackupAt ? lastBackupAt.toISOString() : null,
    programmeDay,
    programmeLengthDays,
    programmeStartDate: startDateStr,
    currentPhase,
    totals: {
      problems: nonArchived.length,
      attempted,
      independent,
    },
    studyToday: {
      currentTopic: currentTopic ? { id: currentTopic.id, name: currentTopic.name } : null,
      nextProblems,
      dueTodayCount,
      overdueCount,
    },
    topicsSummary: {
      covered,
      inProgress,
      remaining,
      perTopic,
    },
    struggling: {
      problems: strugglingProblems,
      topTopics,
    },
    consistency: {
      sessionsThisWeek,
      last4Weeks,
      daysSinceLastSession,
    },
    recentActivity: input.recentAttempts.map((a) => ({
      id: a.id,
      problemId: a.problemId,
      problemTitle: a.problemTitle,
      topicName: a.topicName,
      attemptDate: dsaDateStr(a.attemptDate),
      classification: a.classification,
      timeSpentMin: a.timeSpentMin,
      confidence: a.confidence,
      isRevision: a.isRevision,
    })),
  };
}

export async function getDsaDashboardData(
  explicitUserId?: string,
  tz: string = DSA_DEFAULT_TIMEZONE
): Promise<DsaDashboardData> {
  const userId = explicitUserId ?? (await requireDsaUserId());
  const now = getNow();
  const todayStr = dsaToday(now, tz);

  const [settingsRow, topics, problems, sessions, recentAttempts] = await Promise.all([
    prisma.dsaSettings.findUnique({ where: { userId } }),
    prisma.dsaTopic.findMany({
      where: { userId },
      orderBy: { order: "asc" },
      select: { id: true, name: true, order: true, status: true },
    }),
    prisma.dsaProblem.findMany({
      where: { userId, archived: false },
      include: {
        topic: { select: { name: true } },
        attempts: { select: { classification: true } },
      },
    }),
    prisma.dsaSession.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take: 90,
      select: {
        date: true,
        durationMin: true,
        observations: true,
        _count: { select: { attempts: true } },
      },
    }),
    prisma.dsaAttempt.findMany({
      where: { userId },
      orderBy: { attemptedAt: "desc" },
      take: 8,
      include: {
        problem: {
          select: {
            title: true,
            topic: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  const parsedPhases = Array.isArray(settingsRow?.phases)
    ? (settingsRow.phases as unknown as DsaPhase[])
    : [];

  return computeDsaDashboard({
    now,
    todayStr,
    settings: settingsRow
      ? {
          programmeStartDate: settingsRow.programmeStartDate,
          programmeLengthDays: settingsRow.programmeLengthDays,
          phases: parsedPhases,
          currentTopicId: settingsRow.currentTopicId,
          lastBackupAt: settingsRow.lastBackupAt,
        }
      : null,
    topics,
    problems: problems.map((p) => ({
      id: p.id,
      topicId: p.topicId,
      topicName: p.topic.name,
      subtopic: p.subtopic,
      title: p.title,
      difficulty: p.difficulty,
      sourceUrl: p.sourceUrl,
      orderInTopic: p.orderInTopic,
      archived: p.archived,
      lastClassification: p.lastClassification,
      nextRevisionDate: p.nextRevisionDate,
      manualNextRevisionDate: p.manualNextRevisionDate,
      attempts: p.attempts,
    })),
    sessions: sessions.map((s) => ({
      date: s.date,
      hasActivity:
        s._count.attempts > 0 || s.durationMin !== null || Boolean(s.observations),
    })),
    recentAttempts: recentAttempts.map((a) => ({
      id: a.id,
      problemId: a.problemId,
      problemTitle: a.problem.title,
      topicName: a.problem.topic.name,
      attemptDate: a.attemptDate,
      classification: a.classification,
      timeSpentMin: a.timeSpentMin,
      confidence: a.confidence,
      isRevision: a.isRevision,
    })),
  });
}
