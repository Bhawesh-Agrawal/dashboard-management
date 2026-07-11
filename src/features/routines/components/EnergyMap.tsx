"use client";

import { useMemo, useState } from "react";
import { Battery, Zap, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RoutineWithStreak } from "@/features/routines/types";

// ─── Constants ──────────────────────────────────────────────

const START_HOUR = 6;
const END_HOUR = 22;
const HOURS = END_HOUR - START_HOUR; // 16

const energyColors: Record<string, { block: string; label: string }> = {
  charging: { block: "bg-[#7A9E7E]", label: "Charging" },
  draining: { block: "bg-[#C4868C]", label: "Draining" },
  neutral: { block: "bg-[#E5E2DD]", label: "Neutral" },
};

// ─── Helpers ────────────────────────────────────────────────

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesFromStart(minutes: number): number {
  return minutes - START_HOUR * 60;
}

function formatHour(hour: number): string {
  if (hour === 0 || hour === 12) return hour === 0 ? "12AM" : "12PM";
  return hour > 12 ? `${hour - 12}PM` : `${hour}AM`;
}

function getRoutinePosition(routine: RoutineWithStreak): number {
  if (routine.specificTime) {
    const mins = timeToMinutes(routine.specificTime);
    return minutesFromStart(mins);
  }
  const midpoints: Record<string, number> = {
    morning: 7.5,
    afternoon: 13,
    evening: 19,
    anytime: 20,
  };
  const hour = midpoints[routine.timeOfDay] ?? 12;
  return minutesFromStart(hour * 60);
}

// ─── Energy Curve Calculation ───────────────────────────────

function computeEnergyCurve(routines: RoutineWithStreak[]): number[] {
  // One point per 30 minutes from 6 AM to 10 PM = 32 points
  const points = 32;
  const curve: number[] = new Array(points).fill(60); // baseline 60

  // Sort routines by position
  const sorted = [...routines]
    .map((r) => ({ routine: r, pos: getRoutinePosition(r) }))
    .sort((a, b) => a.pos - b.pos);

  // Apply routine energy effects
  for (const { routine, pos } of sorted) {
    const idx = Math.floor((pos / (HOURS * 60)) * (points - 1));
    if (idx < 0 || idx >= points) continue;

    const effect =
      routine.energyImpact === "charging"
        ? 15
        : routine.energyImpact === "draining"
          ? -15
          : 0;

    // Spread effect over ~2 hours (4 indices)
    for (let j = Math.max(0, idx - 1); j <= Math.min(points - 1, idx + 2); j++) {
      const decay = 1 - Math.abs(j - idx) * 0.25;
      curve[j] += effect * decay;
    }
  }

  // Apply natural circadian decay (slight dip after lunch, evening wind-down)
  for (let i = 0; i < points; i++) {
    const hour = START_HOUR + (i / (points - 1)) * HOURS;
    // Post-lunch dip (1-3 PM)
    if (hour >= 13 && hour <= 15) {
      curve[i] -= 8;
    }
    // Evening wind-down (after 7 PM)
    if (hour >= 19) {
      curve[i] -= (hour - 19) * 5;
    }
    // Morning ramp (6-8 AM)
    if (hour >= 6 && hour <= 8) {
      curve[i] += (hour - 6) * 5;
    }
    // Clamp
    curve[i] = Math.max(0, Math.min(100, curve[i]));
  }

  return curve;
}

function getInsights(
  routines: RoutineWithStreak[],
  curve: number[]
): { icon: "zap" | "battery" | "alert"; text: string }[] {
  const insights: { icon: "zap" | "battery" | "alert"; text: string }[] = [];
  const points = curve.length;

  // Find optimal deep work window (longest stretch above 70)
  let bestStart = -1;
  let bestLen = 0;
  let curStart = -1;
  for (let i = 0; i < points; i++) {
    if (curve[i] > 70) {
      if (curStart === -1) curStart = i;
    } else {
      if (curStart !== -1) {
        const len = i - curStart;
        if (len > bestLen) {
          bestLen = len;
          bestStart = curStart;
        }
        curStart = -1;
      }
    }
  }
  if (curStart !== -1) {
    const len = points - curStart;
    if (len > bestLen) {
      bestLen = len;
      bestStart = curStart;
    }
  }
  if (bestStart >= 0 && bestLen >= 2) {
    const startHour = START_HOUR + (bestStart / (points - 1)) * HOURS;
    const endHour = START_HOUR + ((bestStart + bestLen) / (points - 1)) * HOURS;
    insights.push({
      icon: "zap",
      text: `Optimal deep work: ${formatHour(Math.round(startHour))}–${formatHour(Math.round(endHour))}`,
    });
  }

  // Find energy crash (first drop below 40)
  const crashIdx = curve.findIndex((v) => v < 40);
  if (crashIdx >= 0) {
    const crashHour = START_HOUR + (crashIdx / (points - 1)) * HOURS;
    insights.push({
      icon: "alert",
      text: `Energy crash predicted at ${formatHour(Math.round(crashHour))}`,
    });
  }

  // Check morning/afternoon energy balance
  const morningAvg =
    curve.slice(0, Math.floor(points * 0.375)).reduce((a, b) => a + b, 0) /
    Math.floor(points * 0.375);
  const afternoonAvg =
    curve.slice(Math.floor(points * 0.375), Math.floor(points * 0.75))
      .reduce((a, b) => a + b, 0) /
    Math.floor(points * 0.375);

  if (morningAvg > afternoonAvg + 15) {
    insights.push({
      icon: "battery",
      text: "Charging morning — schedule demanding tasks early",
    });
  } else if (afternoonAvg > morningAvg + 15) {
    insights.push({
      icon: "battery",
      text: "Afternoon energy surge — leverage it for deep work",
    });
  }

  return insights;
}

// ─── Components ─────────────────────────────────────────────

function RoutineBlock({
  routine,
  position,
  width,
  onHover,
}: {
  routine: RoutineWithStreak;
  position: number;
  width: number;
  onHover: (r: RoutineWithStreak | null) => void;
}) {
  const colors = energyColors[routine.energyImpact];

  return (
    <div
      className={cn(
        "absolute top-0 h-full rounded-sm cursor-pointer transition-all duration-150 hover:brightness-110",
        colors.block
      )}
      style={{
        left: `${(position / (HOURS * 60)) * 100}%`,
        width: `${Math.max((width / (HOURS * 60)) * 100, 3)}%`,
        minWidth: "12px",
      }}
      onMouseEnter={() => onHover(routine)}
      onMouseLeave={() => onHover(null)}
    />
  );
}

function Tooltip({ routine }: { routine: RoutineWithStreak }) {
  const colors = energyColors[routine.energyImpact];
  return (
    <div className="absolute -top-8 left-1/2 -translate-x-1/2 z-10 px-2 py-1 rounded bg-foreground text-background text-[0.625rem] whitespace-nowrap pointer-events-none">
      {routine.name} · {colors.label}
    </div>
  );
}

function EnergyCurveSVG({ curve }: { curve: number[] }) {
  const width = 480;
  const height = 60;
  const padding = 4;

  const points = curve
    .map((v, i) => {
      const x = padding + (i / (curve.length - 1)) * (width - padding * 2);
      const y = padding + (1 - v / 100) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-[60px]"
      preserveAspectRatio="none"
    >
      {/* Grid lines */}
      {[25, 50, 75].map((v) => {
        const y = padding + (1 - v / 100) * (height - padding * 2);
        return (
          <line
            key={v}
            x1={padding}
            y1={y}
            x2={width - padding}
            y2={y}
            stroke="#E5E2DD"
            strokeWidth="0.5"
            strokeDasharray="4,4"
          />
        );
      })}
      {/* Energy line */}
      <polyline
        points={points}
        fill="none"
        stroke="#6B7FA3"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Area fill */}
      <polyline
        points={`${padding},${height - padding} ${points} ${width - padding},${height - padding}`}
        fill="#6B7FA3"
        opacity="0.08"
      />
    </svg>
  );
}

// ─── Main Component ─────────────────────────────────────────

export function EnergyMap({
  routines,
}: {
  routines: RoutineWithStreak[];
}) {
  const [hoveredRoutine, setHoveredRoutine] = useState<RoutineWithStreak | null>(null);

  const curve = useMemo(() => computeEnergyCurve(routines), [routines]);
  const insights = useMemo(() => getInsights(routines, curve), [routines, curve]);

  if (routines.length === 0) {
    return (
      <div>
        <p className="section-label mb-3">ENERGY MAP</p>
        <p className="text-sm text-muted-foreground">
          No routines scheduled today. Add routines to see your energy map.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="section-label mb-3">ENERGY MAP</p>

      {/* Timeline */}
      <div className="relative mb-1">
        {/* Hour markers */}
        <div className="flex justify-between text-[0.5rem] text-muted-foreground mb-1">
          {Array.from({ length: HOURS / 2 + 1 }, (_, i) => {
            const hour = START_HOUR + i * 2;
            return <span key={hour}>{formatHour(hour)}</span>;
          })}
        </div>

        {/* Routine blocks */}
        <div className="relative h-6 bg-muted/30 rounded-sm overflow-visible">
          {routines.map((r) => {
            const pos = getRoutinePosition(r);
            const duration = r.specificTime
              ? 60 // default 1 hour block
              : 90; // time-of-day block = 1.5 hours
            return (
              <RoutineBlock
                key={r.id}
                routine={r}
                position={pos}
                width={duration}
                onHover={setHoveredRoutine}
              />
            );
          })}

          {/* Hover tooltip */}
          {hoveredRoutine && <Tooltip routine={hoveredRoutine} />}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 mt-1.5">
          {Object.entries(energyColors).map(([key, { block, label }]) => (
            <div key={key} className="flex items-center gap-1">
              <div className={cn("h-2 w-2 rounded-sm", block)} />
              <span className="text-[0.5rem] text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Energy Curve */}
      <div className="mt-3 mb-2">
        <p className="text-[0.625rem] text-muted-foreground/70 uppercase tracking-widest mb-1">
          Energy Curve
        </p>
        <EnergyCurveSVG curve={curve} />
        <div className="flex justify-between text-[0.5rem] text-muted-foreground/50 mt-0.5">
          <span>Low</span>
          <span>High</span>
        </div>
      </div>

      {/* Insight badges */}
      {insights.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {insights.map((insight, i) => (
            <span
              key={i}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.625rem]",
                insight.icon === "zap" && "bg-[#6B7FA3]/10 text-[#6B7FA3]",
                insight.icon === "alert" && "bg-[#C4868C]/10 text-[#C4868C]",
                insight.icon === "battery" && "bg-[#7A9E7E]/10 text-[#7A9E7E]"
              )}
            >
              {insight.icon === "zap" && <Zap className="h-2.5 w-2.5" />}
              {insight.icon === "alert" && <AlertTriangle className="h-2.5 w-2.5" />}
              {insight.icon === "battery" && <Battery className="h-2.5 w-2.5" />}
              {insight.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
