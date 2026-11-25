import { prisma } from "@/lib/prisma";
import { getNow } from "@/lib/clock";
import { requireDsaUserId } from "./ownership";
import { normalizeReportDates, type TutorReportSourceInput } from "./report";
import { dsaToday, DSA_DEFAULT_TIMEZONE } from "./time";

export async function getDsaReportSourceData(
  explicitUserId?: string,
  tz: string = DSA_DEFAULT_TIMEZONE
): Promise<TutorReportSourceInput> {
  const userId = explicitUserId ?? (await requireDsaUserId());
  const now = getNow();
  const todayStr = dsaToday(now, tz);

  const [settings, topics, problems, sessions, contests] = await Promise.all([
    prisma.dsaSettings.findUnique({ where: { userId } }),
    prisma.dsaTopic.findMany({
      where: { userId },
      orderBy: { order: "asc" },
      select: { id: true, name: true, order: true, status: true },
    }),
    prisma.dsaProblem.findMany({
      where: { userId },
      orderBy: [{ topic: { order: "asc" } }, { orderInTopic: "asc" }],
      include: {
        topic: { select: { name: true } },
        attempts: { orderBy: { attemptedAt: "asc" } },
      },
    }),
    prisma.dsaSession.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take: 45,
      include: {
        attempts: {
          include: {
            problem: { select: { topic: { select: { name: true } } } },
          },
        },
      },
    }),
    prisma.dsaContest.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take: 5,
    }),
  ]);

  return normalizeReportDates({
    now,
    todayStr,
    timezone: tz,
    settings,
    topics,
    problems,
    sessions,
    contests,
  });
}
