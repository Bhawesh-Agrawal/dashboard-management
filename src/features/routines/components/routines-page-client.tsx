"use client";

import { useRoutines, useRoutineCompletions } from "@/lib/sync/hooks";
import { db } from "@/lib/sync/db";
import { useLiveQuery } from "dexie-react-hooks";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { RoutineList } from "@/features/routines/components/routine-list";
import { CreateRoutineDialog } from "@/features/routines/components/routine-form";
import { IdentityGrid } from "@/features/identities/components/IdentityGrid";
import { IdentityForm } from "@/features/identities/components/IdentityForm";

type RoutineWithStreak = {
  id: string;
  name: string;
  timeOfDay: string;
  specificTime: string | null;
  streakGoal: number | null;
  activeDays: string[];
  identityId: string | null;
  currentStreak: number;
  completedToday: boolean;
  lastCompletedAt: Date | null;
};

function getDayOfWeekEnum(day: number): string {
  const map = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  return map[day];
}

function normalizeDate(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function calculateStreak(
  completionDates: Date[],
  activeDays: string[],
  today: Date
): number {
  if (completionDates.length === 0) return 0;

  const completedSet = new Set(
    completionDates.map((d) => normalizeDate(d).toISOString())
  );

  let streak = 0;
  const checkDate = new Date(today);

  while (true) {
    const dateStr = normalizeDate(checkDate).toISOString();
    const dayOfWeek = getDayOfWeekEnum(checkDate.getDay());

    if (activeDays.includes(dayOfWeek)) {
      if (completedSet.has(dateStr)) {
        streak++;
      } else {
        if (normalizeDate(checkDate).getTime() === normalizeDate(today).getTime()) {
          // Today not completed yet - don't break
        } else {
          break;
        }
      }
    }

    checkDate.setDate(checkDate.getDate() - 1);
    if (streak > 365) break;
  }

  return streak;
}

function useRoutinesWithStreaks(): RoutineWithStreak[] {
  const routines = useRoutines();

  // Get all completions for all routines in one query
  const allCompletions = useLiveQuery(async () => {
    if (routines.length === 0) return [];

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString();

    const routineIds = routines.map((r) => r.id);
    const completions = await db.routineCompletions
      .where("routineId")
      .anyOf(routineIds)
      .toArray();

    return completions.filter((c) => c.date >= thirtyDaysAgoStr.split("T")[0]);
  }, [routines.map((r) => r.id).join(",")]) ?? [];

  // Group completions by routineId
  const completionsByRoutine = new Map<string, { date: string; completedAt: string }[]>();
  for (const c of allCompletions) {
    const list = completionsByRoutine.get(c.routineId) ?? [];
    list.push({ date: c.date, completedAt: c.completedAt });
    completionsByRoutine.set(c.routineId, list);
  }

  const today = new Date();
  const todayDayOfWeek = getDayOfWeekEnum(today.getDay());

  // Filter routines active today
  const activeRoutines = routines.filter((r) => r.activeDays.includes(todayDayOfWeek));

  return activeRoutines.map((routine) => {
    const completions = completionsByRoutine.get(routine.id) ?? [];
    const todayTime = normalizeDate(today).getTime();
    const completedToday = completions.some(
      (c) => new Date(c.date).getTime() === todayTime
    );

    const completionDates = completions.map((c) => new Date(c.date));
    const currentStreak = calculateStreak(
      completionDates,
      routine.activeDays,
      today
    );

    const lastCompleted = completions.length > 0 ? completions[0] : null;

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
      lastCompletedAt: lastCompleted ? new Date(lastCompleted.completedAt) : null,
    };
  });
}

export default function RoutinesPageClient() {
  const routinesWithStreaks = useRoutinesWithStreaks();

  // Identities stay server-fetched for now
  const identities: any[] = [];

  return (
    <div>
      <PageHeader
        title="Routines"
        subtitle={`${routinesWithStreaks.length} routine${routinesWithStreaks.length !== 1 ? "s" : ""}`}
        action={<CreateRoutineDialog identities={identities} />}
      />

      {/* Identities section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <p className="section-label">IDENTITIES</p>
          <IdentityForm userId="local" />
        </div>
        <IdentityGrid userId="local" />
      </div>

      {/* Routines section */}
      {routinesWithStreaks.length === 0 ? (
        <EmptyState
          title="No routines yet"
          description="Build daily habits by creating your first routine."
          action={<CreateRoutineDialog identities={identities} />}
        />
      ) : (
        <RoutineList routines={routinesWithStreaks} identities={identities} />
      )}
    </div>
  );
}
