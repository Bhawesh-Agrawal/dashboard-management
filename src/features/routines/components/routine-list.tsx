"use client";

import { useState, useTransition } from "react";
import { completeRoutineAction, uncompleteRoutineAction } from "@/features/routines/lib/actions-completions";
import { db } from "@/lib/sync/db";
import type { RoutineWithStreak } from "@/features/routines/types";
import { Check, Flame } from "lucide-react";
import { EditRoutineDialog } from "./edit-routine-dialog";

const timeLabels: Record<string, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  anytime: "Anytime",
};

export function RoutineList({ routines }: { routines: RoutineWithStreak[] }) {
  const [optimisticRoutines, setOptimisticRoutines] = useState(routines);
  const [pending, startTransition] = useTransition();

  // Group by time of day
  const grouped = optimisticRoutines.reduce(
    (acc, routine) => {
      const key = routine.timeOfDay;
      acc[key] = acc[key] || [];
      acc[key].push(routine);
      return acc;
    },
    {} as Record<string, RoutineWithStreak[]>
  );

  const order = ["morning", "afternoon", "evening", "anytime"];

  function handleToggle(routine: RoutineWithStreak) {
    startTransition(async () => {
      const nowCompleted = !routine.completedToday;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split("T")[0];
      const nowStr = new Date().toISOString();
      const completionId = `${routine.id}_${todayStr}`;

      // Optimistic update
      setOptimisticRoutines((prev) =>
        prev.map((r) =>
          r.id === routine.id
            ? { ...r, completedToday: nowCompleted }
            : r
        )
      );

      // Write to local Dexie immediately (local-first)
      try {
        if (nowCompleted) {
          await db.routineCompletions.put({
            id: completionId,
            routineId: routine.id,
            date: todayStr,
            completedAt: nowStr,
          });
        } else {
          await db.routineCompletions
            .where("routineId")
            .equals(routine.id)
            .and((c) => c.date === todayStr)
            .delete();
        }
      } catch {
        // Dexie write failed — still proceed with server sync
      }

      // Sync to server in background
      try {
        if (nowCompleted) {
          await completeRoutineAction(routine.id);
        } else {
          await uncompleteRoutineAction(routine.id);
        }
      } catch {
        // Server sync failed — local Dexie still has the data
      }
    });
  }

  const totalRoutines = optimisticRoutines.length;
  const completedCount = optimisticRoutines.filter((r) => r.completedToday).length;
  const completionPercentage = totalRoutines > 0 ? Math.round((completedCount / totalRoutines) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Prominent completion percentage */}
      <div className="flex items-end gap-2">
        <span className="text-5xl font-serif">{completionPercentage}</span>
        <span className="text-lg text-muted-foreground mb-1">%</span>
      </div>
      
      {/* Summary header */}
      <div className="flex items-center justify-between">
        <p className="section-label">
          TODAY · {completedCount}/{totalRoutines} today
        </p>
        <div className="h-1.5 w-24 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{
              width: `${completionPercentage}%`,
            }}
          />
        </div>
      </div>

      {/* Grouped by time of day */}
      {order.map((timeOfDay) => {
        const items = grouped[timeOfDay];
        if (!items || items.length === 0) return null;

        return (
          <div key={timeOfDay}>
            <p className="section-label mb-2">{timeLabels[timeOfDay]}</p>
            <div className="space-y-0.5">
              {items.map((routine) => (
                <div
                  key={routine.id}
                  className={`list-row items-center group hover:bg-muted/50 transition-colors ${
                    !routine.isActiveToday ? "opacity-40" : ""
                  }`}
                >
                  {/* Checkbox */}
                  <button
                    onClick={() => handleToggle(routine)}
                    disabled={pending}
                    className="flex items-center gap-3 flex-1 text-left"
                  >
                    <div
                      className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        routine.completedToday
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-input"
                      }`}
                    >
                      {routine.completedToday && (
                        <Check className="h-3 w-3" />
                      )}
                    </div>

                    {/* Name */}
                    <span
                      className={`flex-1 text-sm ${
                        routine.completedToday
                          ? "line-through text-muted-foreground"
                          : ""
                      }`}
                    >
                      {routine.name}
                      {!routine.isActiveToday && (
                        <span className="text-xs text-muted-foreground ml-2">
                          (not today)
                        </span>
                      )}
                    </span>

                    {/* Streak + metadata */}
                    <div className="flex items-center gap-2">
                      {routine.specificTime && (
                        <span className="text-xs text-muted-foreground">
                          {routine.specificTime}
                        </span>
                      )}
                      {routine.currentStreak > 0 && (
                        <span className="flex items-center gap-0.5 text-xs">
                          <Flame className="h-3 w-3 text-orange-500" />
                          <span className="text-muted-foreground">
                            {routine.currentStreak}
                          </span>
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Edit button */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <EditRoutineDialog
                      routine={{
                        id: routine.id,
                        name: routine.name,
                        timeOfDay: routine.timeOfDay,
                        specificTime: routine.specificTime,
                        streakGoal: routine.streakGoal,
                        activeDays: routine.activeDays as ("MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN")[],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
