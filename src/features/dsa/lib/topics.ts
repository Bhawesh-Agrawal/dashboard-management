import { prisma } from "@/lib/prisma";
import { getNow } from "@/lib/clock";
import { requireDsaUserId } from "./ownership";
import { getUserTimezone } from "@/lib/timezone-server";
import { addDaysToDateStr, dsaParseDate, dsaToday } from "./time";
import {
  computeTopicsOverview,
  type TopicClassificationCounts,
  type TopicComputeInput,
  type TopicOverviewItem,
  type TopicsOverviewResult,
  type TopicsSummaryCounts,
} from "./metrics-pure";

export { computeTopicsOverview };
export type {
  TopicClassificationCounts,
  TopicComputeInput,
  TopicOverviewItem,
  TopicsOverviewResult,
  TopicsSummaryCounts,
};

export async function getDsaTopicsOverview(
  explicitUserId?: string,
  tz?: string
): Promise<TopicsOverviewResult> {
  const userId = explicitUserId ?? (await requireDsaUserId());
  const resolvedTz = tz ?? (await getUserTimezone());
  const todayStr = dsaToday(getNow(), resolvedTz);
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
