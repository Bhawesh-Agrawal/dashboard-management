import { prisma } from "@/lib/prisma";
import { memCache, TTL } from "@/lib/mem-cache";

/**
 * Shared streak computation — single source of truth for all streak-related features.
 *
 * Computes the overall activity streak (consecutive days with any activity:
 * routine completion or task completion) walking backward from today.
 */

type ActivityStreakResult = {
  /** Map of ISO date string → activity count for the last N days */
  activityMap: Record<string, number>;
  /** Number of consecutive days with activity ending today (or yesterday if today has none yet) */
  currentStreak: number;
};

/**
 * Compute the activity streak for the last `days` days.
 * Merges RoutineCompletion + Task.completedAt into a single activity map.
 * Cached for 60 seconds to avoid re-running on every dashboard refresh.
 */
export async function computeActivityStreak(
  days: number = 180
): Promise<ActivityStreakResult> {
  return memCache.get(`activityStreak:${days}`, TTL.DASHBOARD, async () => {
    const today = new Date();
    const since = new Date(today);
    since.setDate(since.getDate() - days);

    const [routineCompletions, completedTasks] = await Promise.all([
      prisma.routineCompletion.findMany({
        where: { date: { gte: since } },
        select: { date: true },
      }),
      prisma.task.findMany({
        where: {
          completedAt: { gte: since },
          status: "done",
        },
        select: { completedAt: true },
      }),
    ]);

    // Merge into activity map: dateString → count
    const activityMap: Record<string, number> = {};
    for (const rc of routineCompletions) {
      const key = rc.date.toISOString().split("T")[0];
      activityMap[key] = (activityMap[key] || 0) + 1;
    }
    for (const t of completedTasks) {
      if (t.completedAt) {
        const key = t.completedAt.toISOString().split("T")[0];
        activityMap[key] = (activityMap[key] || 0) + 1;
      }
    }

    // Compute current streak (consecutive days with activity, walking backward from today)
    let currentStreak = 0;
    const checkDate = new Date(today);
    while (true) {
      const key = checkDate.toISOString().split("T")[0];
      if (activityMap[key] && activityMap[key] > 0) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
      if (currentStreak > 365) break;
    }

    return { activityMap, currentStreak };
  });
}

