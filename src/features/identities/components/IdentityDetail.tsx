"use client";

import Link from "next/link";
import { ArrowLeft, Clock, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { IdentityForm } from "./IdentityForm";
import type { Identity, Routine, RoutineCompletion } from "@prisma/client";

type RoutineWithCompletions = Routine & {
  completions: RoutineCompletion[];
};

type IdentityWithRoutines = Identity & {
  routines: RoutineWithCompletions[];
};

const statusStyles: Record<string, string> = {
  aspirational: "bg-[#6B7FA3]/10 text-[#6B7FA3]",
  developing: "bg-[#C49B5C]/10 text-[#C49B5C]",
  integrated: "bg-[#7A9E7E]/10 text-[#7A9E7E]",
  neglected: "bg-[#C4868C]/10 text-[#C4868C]",
};

const suggestions: Record<string, string[]> = {
  aspirational: [
    "Link an existing routine to this identity",
    "Start with one small daily action",
    "Write down why this identity matters to you",
  ],
  developing: [
    "Keep your streak going — consistency compounds",
    "Track your progress weekly",
    "Celebrate small wins along the way",
  ],
  integrated: [
    "Consider mentoring someone on this path",
    "Raise the bar — add a challenging routine",
    "Share your journey to inspire others",
  ],
  neglected: [
    "Reconnect with why this identity mattered",
    "Start with just 2 minutes a day",
    "Link a routine and commit to this week",
  ],
};

function ProgressRing({
  strength,
  color,
  size = 80,
  stroke = 6,
}: {
  strength: number;
  color: string | null;
  size?: number;
  stroke?: number;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - strength / 100);
  const ringColor = color ?? "#6B7FA3";

  return (
    <div className="relative">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#E5E2DD"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xl font-medium text-foreground">
        {strength}
      </span>
    </div>
  );
}

function CompletionBar({
  completions,
  totalDays,
}: {
  completions: number;
  totalDays: number;
}) {
  const pct = totalDays > 0 ? (completions / totalDays) * 100 : 0;
  return (
    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
      <div
        className="h-full rounded-full bg-[#7A9E7E] transition-all"
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  );
}

export function IdentityDetail({
  identity,
  strength,
  trend,
}: {
  identity: IdentityWithRoutines;
  strength: number;
  trend: "up" | "down" | "stable";
}) {
  const last30Days = 30;
  const suggestionsList = suggestions[identity.status] ?? suggestions.aspirational;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <Link
            href="/routines"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
          >
            <ArrowLeft className="h-3 w-3" />
            Routines
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <span
              className={cn(
                "inline-flex items-center rounded-md px-1.5 py-0.5 text-[0.625rem] font-medium uppercase tracking-wider",
                statusStyles[identity.status]
              )}
            >
              {identity.status}
            </span>
            {trend === "up" && (
              <span className="text-[0.625rem] text-[#7A9E7E]">improving</span>
            )}
            {trend === "down" && (
              <span className="text-[0.625rem] text-[#C4868C]">declining</span>
            )}
          </div>
          <h1 className="font-serif text-2xl font-bold text-foreground">
            {identity.statement}
          </h1>
          {identity.description && (
            <p className="text-sm text-muted-foreground mt-1">
              {identity.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <ProgressRing strength={strength} color={identity.color} />
          <IdentityForm identity={identity} userId={identity.userId} />
        </div>
      </div>

      {/* Related Routines */}
      <div>
        <p className="section-label mb-3">LINKED ROUTINES</p>
        {identity.routines.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No routines linked yet. Edit this identity to link routines.
          </p>
        ) : (
          <div className="space-y-0.5">
            {identity.routines.map((routine) => {
              const completedDays = routine.completions.length;
              const adherence =
                routine.activeDays.length > 0
                  ? Math.round(
                      (completedDays /
                        Math.ceil(
                          (last30Days * routine.activeDays.length) / 7
                        )) *
                        100
                    )
                  : 0;

              return (
                <div
                  key={routine.id}
                  className="flex items-center gap-3 p-2.5 rounded-md hover:bg-accent/50 transition-colors"
                >
                  <CheckCircle
                    className={cn(
                      "h-4 w-4 shrink-0",
                      adherence >= 70
                        ? "text-[#7A9E7E]"
                        : adherence >= 40
                          ? "text-[#C49B5C]"
                          : "text-muted-foreground"
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-sm font-medium truncate">
                        {routine.name}
                      </p>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {adherence}%
                      </span>
                    </div>
                    <CompletionBar completions={completedDays} totalDays={30} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Progress History (last 30 days as simple bars) */}
      <div>
        <p className="section-label mb-3">30-DAY ACTIVITY</p>
        <div className="flex items-end gap-1 h-16">
          {Array.from({ length: 30 }, (_, i) => {
            const date = new Date();
            date.setDate(date.getDate() - (29 - i));
            const dayStr = date.toISOString().split("T")[0];
            const count = identity.routines.reduce((sum, r) => {
              const dayCompletions = r.completions.filter(
                (c) => c.date.toISOString().split("T")[0] === dayStr
              ).length;
              return sum + dayCompletions;
            }, 0);
            const maxCount = identity.routines.length || 1;
            const height = Math.min((count / maxCount) * 100, 100);

            return (
              <div
                key={i}
                className="flex-1 rounded-sm bg-[#7A9E7E]/20 transition-all"
                style={{ height: `${Math.max(height, 4)}%` }}
                title={`${dayStr}: ${count} completions`}
              />
            );
          })}
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[0.625rem] text-muted-foreground">30 days ago</span>
          <span className="text-[0.625rem] text-muted-foreground">Today</span>
        </div>
      </div>

      {/* Suggested Actions */}
      <div>
        <p className="section-label mb-3">SUGGESTED ACTIONS</p>
        <div className="space-y-2">
          {suggestionsList.map((suggestion, i) => (
            <div
              key={i}
              className="flex items-start gap-2 text-sm text-muted-foreground"
            >
              <span className="shrink-0 text-muted-foreground/50">•</span>
              <span>{suggestion}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Metadata */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t border-[#E5E2DD]">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Created {identity.createdAt.toLocaleDateString()}
        </span>
        <span>
          {identity.routines.length} linked routine{identity.routines.length !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}
