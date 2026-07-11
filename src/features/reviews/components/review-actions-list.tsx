"use client";

import { useState, useTransition } from "react";
import { completeActionItem } from "../lib/actions";
import type { ActionItem } from "../lib/types";
import { cn } from "@/lib/utils";

const TYPE_COLORS: Record<ActionItem["type"], string> = {
  kill: "bg-red-100 text-red-700",
  automate: "bg-blue-100 text-blue-700",
  focus: "bg-amber-100 text-amber-700",
  unblock: "bg-orange-100 text-orange-700",
  experiment: "bg-purple-100 text-purple-700",
  general: "bg-muted text-muted-foreground",
};

const PRIORITY_COLORS: Record<ActionItem["priority"], string> = {
  high: "text-red-500",
  medium: "text-amber-500",
  low: "text-green-500",
};

export function ReviewActionsList({
  reviewId,
  actions,
}: {
  reviewId: string;
  actions: ActionItem[];
}) {
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [pending, startTransition] = useTransition();

  if (actions.length === 0) return null;

  function handleComplete(index: number) {
    if (completed.has(index)) return;
    startTransition(async () => {
      setCompleted((prev) => new Set(prev).add(index));
      await completeActionItem(reviewId, index);
    });
  }

  return (
    <div className="space-y-2">
      {actions.map((action, i) => (
        <button
          key={i}
          onClick={() => handleComplete(i)}
          disabled={completed.has(i) || pending}
          className={cn(
            "flex items-start gap-3 w-full p-3 rounded-lg border text-left transition-all",
            completed.has(i)
              ? "border-green-200 bg-green-50/50 opacity-60"
              : "border-border hover:border-primary/20 hover:bg-muted/50"
          )}
        >
          <div
            className={cn(
              "shrink-0 mt-0.5 h-5 w-5 rounded border-2 flex items-center justify-center transition-colors",
              completed.has(i)
                ? "bg-green-500 border-green-500 text-white"
                : "border-border"
            )}
          >
            {completed.has(i) && (
              <svg
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={3}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p
              className={cn(
                "text-sm",
                completed.has(i) && "line-through text-muted-foreground"
              )}
            >
              {action.text}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={cn(
                  "text-[0.6rem] px-1.5 py-0.5 rounded uppercase tracking-wider font-medium",
                  TYPE_COLORS[action.type]
                )}
              >
                {action.type}
              </span>
              <span
                className={cn(
                  "text-[0.6rem] font-medium",
                  PRIORITY_COLORS[action.priority]
                )}
              >
                {action.priority}
              </span>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
