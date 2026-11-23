"use client";

import { useState } from "react";
import { TrendingUp, Target, ChevronLeft, ChevronRight, CheckCircle2, Flame, Calendar, Clock } from "lucide-react";
import type { DashboardData } from "@/types";

interface FocusCarouselProps {
  streakData: DashboardData["streakData"];
  topTasks: DashboardData["topTasks"];
  todayClasses: DashboardData["todayClasses"];
  routines: DashboardData["routines"];
}

export function FocusCarousel({
  streakData,
  topTasks,
  todayClasses,
  routines,
}: FocusCarouselProps) {
  const [activeSlide, setActiveSlide] = useState<0 | 1>(0);

  const { currentStreak, activityMap } = streakData;

  // Calculate tasks completed this week (last 7 days) vs previous 7 days
  const today = new Date();
  let thisWeekCount = 0;
  let lastWeekCount = 0;

  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    thisWeekCount += activityMap[key] || 0;
  }

  for (let i = 7; i < 14; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    lastWeekCount += activityMap[key] || 0;
  }

  const diffPercent = lastWeekCount > 0
    ? Math.round(((thisWeekCount - lastWeekCount) / lastWeekCount) * 100)
    : 100;

  const completedRoutines = routines.filter((r) => r.completedToday).length;

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-2xs relative">
      {/* Header controls */}
      <div className="flex items-center justify-between mb-3">
        <span className="section-label flex items-center gap-1.5">
          {activeSlide === 0 ? (
            <>
              <TrendingUp className="h-3.5 w-3.5 text-primary" />
              WEEKLY PROGRESS
            </>
          ) : (
            <>
              <Target className="h-3.5 w-3.5 text-primary" />
              TODAY&apos;S FOCUS
            </>
          )}
        </span>

        <div className="flex items-center gap-1">
          {/* Slide dots */}
          <div className="flex gap-1 mr-2">
            <button
              onClick={() => setActiveSlide(0)}
              className={`h-1.5 rounded-full transition-all ${
                activeSlide === 0 ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/30"
              }`}
              aria-label="Slide 1"
            />
            <button
              onClick={() => setActiveSlide(1)}
              className={`h-1.5 rounded-full transition-all ${
                activeSlide === 1 ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/30"
              }`}
              aria-label="Slide 2"
            />
          </div>

          <button
            onClick={() => setActiveSlide(activeSlide === 0 ? 1 : 0)}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Next slide"
          >
            {activeSlide === 0 ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Slide 1: Weekly Progress */}
      {activeSlide === 0 ? (
        <div className="space-y-3 animate-in fade-in duration-200">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted/40 p-3 rounded-lg border border-border/50">
              <span className="text-[0.65rem] text-muted-foreground section-label">ACTIVITIES (7d)</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-xl font-bold font-serif">{thisWeekCount}</span>
                {diffPercent !== 0 && (
                  <span
                    className={`text-xs font-medium ${
                      diffPercent >= 0 ? "text-emerald-600" : "text-amber-600"
                    }`}
                  >
                    {diffPercent >= 0 ? `+${diffPercent}%` : `${diffPercent}%`}
                  </span>
                )}
              </div>
            </div>

            <div className="bg-muted/40 p-3 rounded-lg border border-border/50">
              <span className="text-[0.65rem] text-muted-foreground section-label">STREAK</span>
              <div className="flex items-center gap-1.5 mt-1">
                <Flame className="h-5 w-5 text-orange-500 fill-orange-500/20" />
                <span className="text-xl font-bold font-serif">{currentStreak} <span className="text-xs font-normal text-muted-foreground">days</span></span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground bg-accent/40 px-3 py-2 rounded-md">
            <span>Routines completed today:</span>
            <span className="font-semibold text-foreground">
              {completedRoutines}/{routines.length} ({routines.length > 0 ? Math.round((completedRoutines / routines.length) * 100) : 0}%)
            </span>
          </div>
        </div>
      ) : (
        /* Slide 2: Today's Focus */
        <div className="space-y-2 animate-in fade-in duration-200">
          {todayClasses.length > 0 && (
            <div className="flex items-center gap-2 text-xs bg-muted/30 p-2 rounded-md">
              <Calendar className="h-4 w-4 text-primary shrink-0" />
              <span className="truncate">
                Next class: <strong className="font-medium text-foreground">{todayClasses[0].course.name}</strong> ({todayClasses[0].startTime})
              </span>
            </div>
          )}

          {topTasks.length > 0 ? (
            <div className="space-y-1.5 pt-1">
              <span className="text-[0.65rem] text-muted-foreground section-label">TOP TASK</span>
              <div className="flex items-center gap-2 text-xs font-medium text-foreground bg-accent/50 p-2 rounded-md">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                <span className="truncate">{topTasks[0].title}</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
              <span>No urgent tasks starred for today.</span>
            </div>
          )}

          <p className="text-[0.7rem] text-muted-foreground text-center pt-1">
            Focus on one task at a time to build momentum.
          </p>
        </div>
      )}
    </div>
  );
}
