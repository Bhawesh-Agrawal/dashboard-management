import { prisma } from "@/lib/prisma";
import { getNow } from "@/lib/clock";
import { requireDsaUserId } from "./ownership";
import { getUserTimezone } from "@/lib/timezone-server";
import { dsaDateStr, dsaToday } from "./time";
import type { DsaContestPlatformValue } from "./schemas";

export interface DsaContestItem {
  id: string;
  platform: DsaContestPlatformValue;
  name: string;
  date: string;
  problemsAttempted: number;
  problemsSolved: number;
  rankOrRating: string | null;
  upsolveProblems: string | null;
  conceptsMissed: string | null;
}

export async function getDsaContestsPageData(
  explicitUserId?: string,
  tz?: string
): Promise<{ todayStr: string; contests: DsaContestItem[] }> {
  const userId = explicitUserId ?? (await requireDsaUserId());
  const resolvedTz = tz ?? (await getUserTimezone());
  const todayStr = dsaToday(getNow(), resolvedTz);

  const rows = await prisma.dsaContest.findMany({
    where: { userId },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  return {
    todayStr,
    contests: rows.map((c) => ({
      id: c.id,
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
