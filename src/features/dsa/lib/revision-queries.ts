import { prisma } from "@/lib/prisma";
import { getNow } from "@/lib/clock";
import { requireDsaUserId } from "./ownership";
import { buildRevisionQueue, type RevisionQueueSections } from "./revision";
import { dsaToday, DSA_DEFAULT_TIMEZONE } from "./time";

export async function getDsaRevisionQueue(
  explicitUserId?: string,
  tz: string = DSA_DEFAULT_TIMEZONE
): Promise<{ todayStr: string; queue: RevisionQueueSections }> {
  const userId = explicitUserId ?? (await requireDsaUserId());
  const todayStr = dsaToday(getNow(), tz);

  const problems = await prisma.dsaProblem.findMany({
    where: { userId, archived: false },
    include: {
      topic: { select: { name: true } },
      attempts: {
        select: {
          attemptDate: true,
          classification: true,
          isRevision: true,
        },
      },
    },
  });

  const queue = buildRevisionQueue(
    problems.map((p) => ({
      id: p.id,
      topicId: p.topicId,
      topicName: p.topic.name,
      subtopic: p.subtopic,
      title: p.title,
      difficulty: p.difficulty,
      sourceUrl: p.sourceUrl,
      archived: p.archived,
      lastClassification: p.lastClassification,
      intervalDays: p.intervalDays,
      consecutiveIndependent: p.consecutiveIndependent,
      nextRevisionDate: p.nextRevisionDate,
      manualNextRevisionDate: p.manualNextRevisionDate,
      attempts: p.attempts,
    })),
    todayStr
  );

  return { todayStr, queue };
}
