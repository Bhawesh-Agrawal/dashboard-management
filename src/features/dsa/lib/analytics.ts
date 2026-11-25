import { prisma } from "@/lib/prisma";
import { getNow } from "@/lib/clock";
import { requireDsaUserId } from "./ownership";
import {
  addDaysToDateStr,
  dsaDateStr,
  dsaToday,
  getWeekStartMonday,
  DSA_DEFAULT_TIMEZONE,
} from "./time";
import type { DsaClassificationValue } from "./schemas";

export interface WeeklyTopicTrendData {
  weekStarts: string[]; // oldest -> newest (e.g. 6 weeks)
  rows: Array<{
    topicId: string;
    topicName: string;
    cells: Array<{
      weekStart: string;
      attempted: number;
      independent: number;
    }>;
  }>;
}

export function computeWeeklyTopicTrend(input: {
  todayStr: string;
  weeksCount?: number;
  topics: Array<{ id: string; name: string; order: number }>;
  attempts: Array<{
    topicId: string;
    attemptDate: Date | string;
    classification: DsaClassificationValue;
  }>;
}): WeeklyTopicTrendData {
  const weeksCount = input.weeksCount ?? 6;
  const currentWeekStart = getWeekStartMonday(input.todayStr);
  const weekStarts: string[] = [];
  for (let i = weeksCount - 1; i >= 0; i--) {
    weekStarts.push(addDaysToDateStr(currentWeekStart, -7 * i));
  }

  const weekSet = new Set(weekStarts);
  const grid = new Map<string, Map<string, { attempted: number; independent: number }>>();
  for (const t of input.topics) {
    const rowMap = new Map<string, { attempted: number; independent: number }>();
    for (const ws of weekStarts) {
      rowMap.set(ws, { attempted: 0, independent: 0 });
    }
    grid.set(t.id, rowMap);
  }

  for (const a of input.attempts) {
    const ws = getWeekStartMonday(dsaDateStr(a.attemptDate));
    if (!weekSet.has(ws)) continue;
    const rowMap = grid.get(a.topicId);
    if (!rowMap) continue;
    const cell = rowMap.get(ws);
    if (!cell) continue;
    cell.attempted++;
    if (a.classification === "independent") {
      cell.independent++;
    }
  }

  const rows = input.topics.map((t) => {
    const rowMap = grid.get(t.id)!;
    return {
      topicId: t.id,
      topicName: t.name,
      cells: weekStarts.map((ws) => ({
        weekStart: ws,
        ...rowMap.get(ws)!,
      })),
    };
  });

  return { weekStarts, rows };
}

export async function getDsaWeeklyTopicTrend(
  explicitUserId?: string,
  tz: string = DSA_DEFAULT_TIMEZONE
): Promise<WeeklyTopicTrendData> {
  const userId = explicitUserId ?? (await requireDsaUserId());
  const todayStr = dsaToday(getNow(), tz);
  const currentWeekStart = getWeekStartMonday(todayStr);
  const windowStartStr = addDaysToDateStr(currentWeekStart, -7 * 5);

  const [topics, attempts] = await Promise.all([
    prisma.dsaTopic.findMany({
      where: { userId },
      orderBy: { order: "asc" },
      select: { id: true, name: true, order: true },
    }),
    prisma.dsaAttempt.findMany({
      where: {
        userId,
        attemptDate: { gte: new Date(`${windowStartStr}T00:00:00.000Z`) },
      },
      select: {
        attemptDate: true,
        classification: true,
        problem: { select: { topicId: true } },
      },
    }),
  ]);

  return computeWeeklyTopicTrend({
    todayStr,
    weeksCount: 6,
    topics,
    attempts: attempts.map((a) => ({
      topicId: a.problem.topicId,
      attemptDate: a.attemptDate,
      classification: a.classification,
    })),
  });
}
