import { prisma } from "@/lib/prisma";
import { cache } from "react";
import type { RoutineWithStreak } from "@/features/routines/types";

export type { RoutineWithStreak };

/**
 * Get all routines with streak information for today.
 * Uses a single bulk completions query instead of one per routine (N+1 fix).
 */
export const getRoutinesWithStreaks = cache(
  async (): Promise<RoutineWithStreak[]> => {
    const today = new Date();
    const todayDayOfWeek = getDayOfWeekEnum(today.getDay()) as "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

    // Get all active routines for today
    const routines = await prisma.routine.findMany({
      where: {
        activeDays: { has: todayDayOfWeek },
      },
      orderBy: [{ timeOfDay: "asc" }, { name: "asc" }],
    });

    if (routines.length === 0) return [];

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // ─── SINGLE bulk query instead of N per-routine queries ───
    let allCompletions: { routineId: string; date: Date; completedAt: Date }[] = [];
    try {
      allCompletions = await prisma.routineCompletion.findMany({
        where: {
          routineId: { in: routines.map((r) => r.id) },
          date: { gte: thirtyDaysAgo },
        },
        orderBy: { date: "desc" },
        select: { routineId: true, date: true, completedAt: true },
      });
    } catch {
      // Table may not exist yet — treat as no completions
      allCompletions = [];
    }

    // Group completions by routineId in memory
    const completionsByRoutine = new Map<string, { date: Date; completedAt: Date }[]>();
    for (const c of allCompletions) {
      const list = completionsByRoutine.get(c.routineId) ?? [];
      list.push({ date: c.date, completedAt: c.completedAt });
      completionsByRoutine.set(c.routineId, list);
    }

    // Build result for each routine
    const routinesWithStreaks: RoutineWithStreak[] = routines.map((routine) => {
      const completions = completionsByRoutine.get(routine.id) ?? [];

      const todayTime = normalizeDate(today).getTime();
      const completedToday = completions.some(
        (c) => normalizeDate(c.date).getTime() === todayTime
      );

      const currentStreak = calculateStreak(
        completions.map((c) => c.date),
        routine.activeDays,
        today
      );

      return {
        id: routine.id,
        name: routine.name,
        timeOfDay: routine.timeOfDay,
        specificTime: routine.specificTime,
        streakGoal: routine.streakGoal,
        activeDays: routine.activeDays,
        identityId: routine.identityId,
        currentStreak,
        completedToday,
        lastCompletedAt: completions[0]?.completedAt ?? null,
        isActiveToday: true,
      };
    });

    return routinesWithStreaks;
  }
);

/**
 * Mark a routine as completed for today (or a specific date).
 * Silently fails if the table doesn't exist yet.
 */
export async function completeRoutine(
  routineId: string,
  date?: Date
): Promise<void> {
  try {
    const completionDate = date || new Date();

    // Upsert to handle already completed
    await prisma.routineCompletion.upsert({
      where: {
        routineId_date: {
          routineId,
          date: normalizeDate(completionDate),
        },
      },
      create: {
        routineId,
        date: normalizeDate(completionDate),
      },
      update: {
        completedAt: new Date(),
      },
    });
  } catch {
    // Table may not exist yet — silently succeed
  }
}

/**
 * Remove a routine completion for today (undo).
 * Silently fails if the table doesn't exist yet.
 */
export async function uncompleteRoutine(
  routineId: string,
  date?: Date
): Promise<void> {
  try {
    const completionDate = date || new Date();

    await prisma.routineCompletion.deleteMany({
      where: {
        routineId,
        date: normalizeDate(completionDate),
      },
    });
  } catch {
    // Table may not exist yet — silently succeed
  }
}

/**
 * Calculate the current streak of consecutive completions.
 * Only counts days where the routine is active (based on activeDays).
 */
function calculateStreak(
  completionDates: Date[],
  activeDays: string[],
  today: Date
): number {
  if (completionDates.length === 0) return 0;

  // Normalize all completion dates to date strings
  const completedSet = new Set(
    completionDates.map((d) => normalizeDate(d).toISOString())
  );

  let streak = 0;
  const checkDate = new Date(today);

  // Start from today and go backwards
  while (true) {
    const dateStr = normalizeDate(checkDate).toISOString();
    const dayOfWeek = getDayOfWeekEnum(checkDate.getDay());

    // Only count days where the routine is active
    if (activeDays.includes(dayOfWeek)) {
      if (completedSet.has(dateStr)) {
        streak++;
      } else {
        // If this is today and not completed yet, allow continuing the streak
        if (normalizeDate(checkDate).getTime() === normalizeDate(today).getTime()) {
          // Today not completed yet — don't break, just don't count
        } else {
          // Missed an active day — streak broken
          break;
        }
      }
    }

    // Move to previous day
    checkDate.setDate(checkDate.getDate() - 1);

    // Don't go back more than 365 days
    if (streak > 365) break;
  }

  return streak;
}

/**
 * Get the day of week enum value from a JavaScript day number.
 */
function getDayOfWeekEnum(day: number): string {
  const map = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  return map[day];
}

/**
 * Normalize a date to midnight (no time component).
 */
function normalizeDate(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
