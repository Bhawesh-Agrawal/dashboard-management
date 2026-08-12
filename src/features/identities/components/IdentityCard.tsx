"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IdentityProgress } from "../lib/actions";

const statusStyles: Record<string, string> = {
  aspirational: "bg-[#6B7FA3]/10 text-[#6B7FA3]",
  developing: "bg-[#C49B5C]/10 text-[#C49B5C]",
  integrated: "bg-[#7A9E7E]/10 text-[#7A9E7E]",
  neglected: "bg-[#C4868C]/10 text-[#C4868C]",
};

const chartColors: Record<string, string> = {
  "#6B7FA3": "#6B7FA3",
  "#7A9E7E": "#7A9E7E",
  "#C4868C": "#C4868C",
  "#C49B5C": "#C49B5C",
  "#9B8EC4": "#9B8EC4",
};

const defaultRingColor = "#6B7FA3";

function timeAgo(date: Date | null): string {
  if (!date) return "never";
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function ProgressRing({
  strength,
  color,
  size = 48,
  stroke = 4,
  pulse = false,
}: {
  strength: number;
  color: string | null;
  size?: number;
  stroke?: number;
  pulse?: boolean;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - strength / 100);
  const ringColor = color && chartColors[color] ? color : defaultRingColor;

  return (
    <div className={cn("relative", pulse && "animate-pulse")}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
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
      <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-foreground">
        {strength}
      </span>
    </div>
  );
}

function TrendIcon({ trend }: { trend: "up" | "down" | "stable" }) {
  if (trend === "up")
    return <TrendingUp className="h-3 w-3 text-[#7A9E7E]" />;
  if (trend === "down")
    return <TrendingDown className="h-3 w-3 text-[#C4868C]" />;
  return <Minus className="h-3 w-3 text-muted-foreground" />;
}

export function IdentityCard({
  progress,
  compact = false,
}: {
  progress: IdentityProgress;
  compact?: boolean;
}) {
  const { identity, strength, trend, relatedRoutines, lastActivity } = progress;
  const isNeglected = identity.status === "neglected";

  if (compact) {
    return (
      <Link
        href={`/routines/identities/${identity.id}`}
        className="flex items-center gap-3 p-2.5 rounded-md hover:bg-accent/50 transition-colors group"
      >
        <ProgressRing
          strength={strength}
          color={identity.color}
          size={36}
          stroke={3}
          pulse={isNeglected}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate group-hover:text-foreground transition-colors">
            {identity.statement}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <TrendIcon trend={trend} />
            <span className="text-[0.625rem] text-muted-foreground">
              {relatedRoutines.length} routine{relatedRoutines.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <Link
        href={`/routines/identities/${identity.id}`}
        className={cn(
          "block rounded-lg border border-border bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm",
          isNeglected && "border-l-[3px] border-l-[#C4868C]"
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Status badge */}
            <span
              className={cn(
                "inline-flex items-center rounded-md px-1.5 py-0.5 text-[0.625rem] font-medium uppercase tracking-wider mb-2",
                statusStyles[identity.status]
              )}
            >
              {identity.status}
            </span>

            {/* Statement */}
            <p className="text-sm font-medium leading-snug text-foreground mb-1">
              {identity.statement}
            </p>

            {/* Description */}
            {identity.description && (
              <p className="text-xs leading-relaxed text-muted-foreground mb-2 line-clamp-2">
                {identity.description}
              </p>
            )}

            {/* Metadata row */}
            <div className="flex items-center gap-3 text-[0.625rem] text-muted-foreground">
              <span className="flex items-center gap-1">
                <TrendIcon trend={trend} />
                {trend === "up" ? "improving" : trend === "down" ? "declining" : "stable"}
              </span>
              <span>
                {relatedRoutines.length} routine{relatedRoutines.length !== 1 ? "s" : ""}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                {timeAgo(lastActivity)}
              </span>
            </div>
          </div>

          {/* Progress ring */}
          <ProgressRing
            strength={strength}
            color={identity.color}
            pulse={isNeglected}
          />
        </div>
      </Link>
    </motion.div>
  );
}
