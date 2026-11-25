import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { getNow } from "@/lib/clock";
import { ownerWhere } from "@/lib/owner-scoping";
import { getTodayInTimezone, parseDateOnly } from "@/lib/timezone";
import { getUserTimezone } from "@/lib/timezone-server";

/**
 * Prisma `where` clause for the semester(s) whose date range contains `todayDateOnly`,
 * strictly owner-scoped via `ownerWhere(userId)`.
 */
export function currentSemesterWhere(userId: string, todayDateOnly: string) {
  const dayStartUtc = parseDateOnly(todayDateOnly);
  const dayEndUtc = new Date(dayStartUtc.getTime() + 24 * 60 * 60 * 1000 - 1);
  return {
    ...ownerWhere(userId),
    startDate: { lte: dayEndUtc },
    endDate: { gte: dayStartUtc },
  };
}

/**
 * Returns the current semester whose date range contains today (in the user's timezone),
 * owner-scoped via `ownerWhere`. If multiple overlap, prefers `isActive = true`,
 * then latest `startDate`. Returns `null` if none match.
 */
export async function getCurrentSemester(
  explicitUserId?: string,
  now?: Date
) {
  const userId = explicitUserId ?? (await getCurrentUserId());
  const timezone = await getUserTimezone(userId);
  const todayDateOnly = getTodayInTimezone(timezone, now ?? getNow());

  return prisma.semester.findFirst({
    where: currentSemesterWhere(userId, todayDateOnly),
    orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
    include: {
      courses: {
        orderBy: { name: "asc" },
      },
    },
  });
}
