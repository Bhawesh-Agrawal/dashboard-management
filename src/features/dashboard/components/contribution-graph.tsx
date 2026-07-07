"use client";

import { useMemo, useState } from "react";
import type { DashboardData } from "@/types";
import { Flame } from "lucide-react";

const INTENSITY_COLORS = [
  "bg-muted",          // 0 activities
  "bg-emerald-200",    // 1-2 activities
  "bg-emerald-300",    // 3-4 activities
  "bg-emerald-500",    // 5-6 activities
  "bg-emerald-700",    // 7+ activities
];

function getIntensityClass(count: number): string {
  if (count === 0) return INTENSITY_COLORS[0];
  if (count <= 2) return INTENSITY_COLORS[1];
  if (count <= 4) return INTENSITY_COLORS[2];
  if (count <= 6) return INTENSITY_COLORS[3];
  return INTENSITY_COLORS[4];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ContributionGraph({
  streakData,
}: {
  streakData: DashboardData["streakData"];
}) {
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);
  const { activityMap, currentStreak } = streakData;

  // Build the grid: last 180 days (desktop) / 90 days (mobile)
  const gridDays = useMemo(() => {
    const days: { date: Date; key: string; count: number }[] = [];
    const today = new Date();
    for (let i = 179; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      days.push({ date: d, key, count: activityMap[key] || 0 });
    }
    return days;
  }, [activityMap]);

  // Organize into weeks (columns) with 7 rows (days of week)
  const weeks = useMemo(() => {
    const result: { date: Date; key: string; count: number }[][] = [];
    let currentWeek: { date: Date; key: string; count: number }[] = [];

    for (const day of gridDays) {
      const dayOfWeek = day.date.getDay(); // 0=Sun, 6=Sat
      if (dayOfWeek === 0 && currentWeek.length > 0) {
        result.push(currentWeek);
        currentWeek = [];
      }
      currentWeek.push(day);
    }
    if (currentWeek.length > 0) result.push(currentWeek);
    return result;
  }, [gridDays]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="section-label">ACTIVITY</p>
        {currentStreak > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Flame className="h-3 w-3 text-orange-500" />
            {currentStreak}-day streak
          </span>
        )}
      </div>

      {/* Tooltip */}
      {hoveredDay && (
        <div className="text-xs text-muted-foreground mb-2">
          {formatDate(hoveredDay)}: {activityMap[hoveredDay] || 0} activities
        </div>
      )}

      {/* Heatmap grid */}
      <div className="overflow-x-auto">
        <div className="flex gap-[3px]">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {week.map((day) => (
                <button
                  key={day.key}
                  className={`h-2.5 w-2.5 rounded-sm ${getIntensityClass(day.count)} transition-colors hover:ring-1 hover:ring-foreground/20`}
                  onMouseEnter={() => setHoveredDay(day.key)}
                  onMouseLeave={() => setHoveredDay(null)}
                  aria-label={`${formatDate(day.key)}: ${day.count} activities`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-1 mt-2 text-[0.6rem] text-muted-foreground">
        <span>Less</span>
        {INTENSITY_COLORS.map((cls, i) => (
          <div key={i} className={`h-2 w-2 rounded-sm ${cls}`} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
