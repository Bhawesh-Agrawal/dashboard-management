"use client";

import { useState, useEffect, useMemo } from "react";
import { useTasks, useRoutines, useEvents, useRoutineCompletions } from "@/lib/sync/hooks";
import { db } from "@/lib/sync/db";
import { useLiveQuery } from "dexie-react-hooks";
import { TodayDashboard } from "@/features/dashboard/components/today-dashboard";
import { getRoutinesWithStreaks } from "@/features/routines/lib/completions";
import type { DsaDueSummary } from "@/features/dsa/lib/summary";
import type { DashboardData } from "@/types";

type ServerDashboardData = DashboardData & {
  widgetOrder: string[];
  hiddenWidgets: string[];
};

export default function TodayPageClient({
  dsaSummary,
}: {
  dsaSummary?: DsaDueSummary | null;
}) {
  const [serverData, setServerData] = useState<ServerDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  // Read synced entities from Dexie
  const allTasks = useTasks();
  const routines = useRoutines();
  const events = useEvents();

  // Compute routines with streaks from Dexie completions
  const routinesWithStreaks = useLiveQuery(async () => {
    if (routines.length === 0) return [];

    const today = new Date();
    const todayDayOfWeek = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][today.getDay()];

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString();

    const routineIds = routines.map((r) => r.id);
    const completions = await db.routineCompletions
      .where("routineId")
      .anyOf(routineIds)
      .toArray();

    const recentCompletions = completions.filter((c) => c.date >= thirtyDaysAgoStr.split("T")[0]);

    const completionsByRoutine = new Map<string, { date: string; completedAt: string }[]>();
    for (const c of recentCompletions) {
      const list = completionsByRoutine.get(c.routineId) ?? [];
      list.push({ date: c.date, completedAt: c.completedAt });
      completionsByRoutine.set(c.routineId, list);
    }

    return routines.map((routine) => {
      const routineCompletions = completionsByRoutine.get(routine.id) ?? [];
      const todayTime = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
      const completedToday = routineCompletions.some(
        (c) => new Date(c.date).getTime() === todayTime
      );

      // Simple streak calculation
      let streak = 0;
      const completedSet = new Set(
        routineCompletions.map((c) => new Date(c.date).toISOString().split("T")[0])
      );
      const checkDate = new Date(today);
      while (streak < 365) {
        const key = checkDate.toISOString().split("T")[0];
        const dayName = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][checkDate.getDay()];
        if (routine.activeDays.includes(dayName)) {
          if (completedSet.has(key)) {
            streak++;
          } else if (checkDate.toDateString() === today.toDateString()) {
            // Today not completed yet, don't break
          } else {
            break;
          }
        }
        checkDate.setDate(checkDate.getDate() - 1);
      }

      const lastCompleted = routineCompletions.length > 0 ? routineCompletions[0] : null;

      return {
        id: routine.id,
        name: routine.name,
        timeOfDay: routine.timeOfDay,
        specificTime: routine.specificTime,
        streakGoal: routine.streakGoal,
        activeDays: routine.activeDays,
        currentStreak: streak,
        completedToday,
        lastCompletedAt: lastCompleted ? new Date(lastCompleted.completedAt) : null,
        isActiveToday: routine.activeDays.includes(todayDayOfWeek),
      };
    });
  }, [routines]) ?? [];

  // Fetch server-only dashboard data
  useEffect(() => {
    async function fetchServerData() {
      try {
        const res = await fetch("/api/sync/dashboard", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setServerData(data);
        }
      } catch (error) {
        console.error("Failed to fetch dashboard server data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchServerData();
  }, []);

  // Build tasks from Dexie
  const today = new Date();
  const topTasks = useMemo(
    () => allTasks.filter((t) => t.starred && t.status === "open").slice(0, 3),
    [allTasks]
  );
  const allOpenTasks = useMemo(
    () =>
      allTasks
        .filter((t) => t.status === "open" && !topTasks.some((tt) => tt.id === t.id))
        .slice(0, 10),
    [allTasks, topTasks]
  );

  // Build upcoming deadlines from Dexie events + tasks
  const upcomingDeadlines = useMemo(() => {
    const deadlines: any[] = [];

    // Tasks with due dates
    for (const task of allTasks) {
      if (task.status === "open" && task.dueDate) {
        deadlines.push({
          id: task.id,
          title: task.title,
          date: new Date(task.dueDate),
          type: "task" as const,
          courseId: task.courseId,
          courseName: task.courseName,
          courseColor: task.courseColor,
        });
      }
    }

    // Events
    for (const event of events) {
      deadlines.push({
        id: `event-${event.id}`,
        title: event.title,
        date: new Date(event.dateTime),
        type: "event" as const,
        location: event.location ?? undefined,
      });
    }

    // Add server-only deadlines (birthdays from server)
    if (serverData?.upcomingDeadlines) {
      for (const d of serverData.upcomingDeadlines) {
        deadlines.push({
          ...d,
          date: new Date(d.date),
        });
      }
    }

    deadlines.sort((a, b) => a.date.getTime() - b.date.getTime());
    return deadlines;
  }, [allTasks, events, serverData]);

  // Merge routines from Dexie with server data
  const mergedRoutines = routinesWithStreaks.length > 0 ? routinesWithStreaks : serverData?.routines ?? [];

  // Build full DashboardData
  const dashboardData: DashboardData = {
    topTasks: topTasks as any,
    allOpenTasks: allOpenTasks as any,
    todayClasses: serverData?.todayClasses ?? [],
    upcomingDeadlines: upcomingDeadlines as any,
    attendanceAlerts: serverData?.attendanceAlerts ?? [],
    routines: mergedRoutines,
    tomorrowRoutines: serverData?.tomorrowRoutines ?? [],
    streakData: serverData?.streakData ?? { activityMap: {}, currentStreak: 0 },
    activeProjects: serverData?.activeProjects ?? [],
    latestReview: serverData?.latestReview ?? null,
    unviewedReviewCount: serverData?.unviewedReviewCount ?? 0,
    sgpa: serverData?.sgpa ?? null,
    cgpa: serverData?.cgpa ?? null,
  };

  const formattedDate = today.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  if (loading && !serverData) {
    return (
      <div>
        <div className="mb-8">
          <h1 className="page-heading">{formattedDate}</h1>
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="page-heading">{formattedDate}</h1>
      </div>

      <TodayDashboard
        data={dashboardData}
        widgetOrder={serverData?.widgetOrder ?? []}
        hiddenWidgets={serverData?.hiddenWidgets ?? []}
        userId="local"
        dsaSummary={dsaSummary}
      />
    </div>
  );
}
