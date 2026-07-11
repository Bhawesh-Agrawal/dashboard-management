"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Zap, Clock, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  suggestTaskOrder,
  applyTaskOrder,
  type TaskWithEnergy,
} from "../lib/actions-energy";

const energyBadge: Record<string, { icon: string; color: string }> = {
  high: { icon: "⚡", color: "bg-[#C4868C]/10 text-[#C4868C]" },
  medium: { icon: "🔋", color: "bg-[#C49B5C]/10 text-[#C49B5C]" },
  low: { icon: "🟢", color: "bg-[#7A9E7E]/10 text-[#7A9E7E]" },
};

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function TaskRow({
  task,
  index,
  changed = false,
}: {
  task: TaskWithEnergy;
  index: number;
  changed?: boolean;
}) {
  const energy = task.energyRequirement ?? "medium";
  const badge = energyBadge[energy] ?? energyBadge.medium;

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-2.5 rounded-md transition-colors",
        changed && "bg-[#C49B5C]/5",
        !changed && "hover:bg-accent/50"
      )}
    >
      <span className="text-xs text-muted-foreground w-4 text-right shrink-0">
        {index + 1}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{task.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={cn("inline-flex items-center gap-0.5 text-[0.625rem] px-1 py-0.5 rounded", badge.color)}>
            {badge.icon} {energy}
          </span>
          {task.estimatedDuration && (
            <span className="flex items-center gap-0.5 text-[0.625rem] text-muted-foreground">
              <Clock className="h-2.5 w-2.5" />
              {formatDuration(task.estimatedDuration)}
            </span>
          )}
          {task.course && (
            <span className="text-[0.625rem] text-muted-foreground truncate">
              {task.course.name}
            </span>
          )}
        </div>
      </div>
      {task.dueDate && (
        <span className="text-[0.625rem] text-muted-foreground shrink-0">
          {new Date(task.dueDate).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
        </span>
      )}
    </div>
  );
}

export function EnergyTaskSorter({
  userId,
  initialTasks,
}: {
  userId: string;
  initialTasks: TaskWithEnergy[];
}) {
  const [result, setResult] = useState<{
    current: TaskWithEnergy[];
    suggested: TaskWithEnergy[];
    explanation: string[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, startTransition] = useTransition();
  const [applied, setApplied] = useState(false);
  const router = useRouter();

  async function handleSuggest() {
    setLoading(true);
    try {
      const res = await suggestTaskOrder(userId, new Date());
      setResult(res);
    } finally {
      setLoading(false);
    }
  }

  function handleApply() {
    if (!result) return;
    startTransition(async () => {
      const ids = result.suggested.map((t) => t.id);
      await applyTaskOrder(ids);
      setApplied(true);
      router.refresh();
    });
  }

  if (initialTasks.length === 0) {
    return null;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="section-label flex items-center gap-1.5">
          <Zap className="h-3 w-3" />
          TASK SEQUENCING
        </p>
        {!result && (
          <button
            onClick={handleSuggest}
            disabled={loading}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {loading ? "Analyzing..." : "Suggest Order"}
          </button>
        )}
      </div>

      {!result && !loading && (
        <p className="text-sm text-muted-foreground">
          Analyze your energy patterns and suggest the optimal task order.
        </p>
      )}

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-12 bg-muted animate-pulse rounded-md" />
          ))}
        </div>
      )}

      {result && (
        <div>
          {/* Explanation */}
          {result.explanation.length > 0 && (
            <div className="mb-3 space-y-1">
              {result.explanation.map((exp, i) => (
                <p key={i} className="text-xs text-muted-foreground">
                  {exp}
                </p>
              ))}
            </div>
          )}

          {/* Diff view */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Current order */}
            <div>
              <p className="text-[0.625rem] text-muted-foreground/70 uppercase tracking-widest mb-1.5">
                Current Order
              </p>
              <div className="space-y-0.5">
                {result.current.map((task, i) => (
                  <TaskRow key={task.id} task={task} index={i} />
                ))}
              </div>
            </div>

            {/* Suggested order */}
            <div>
              <p className="text-[0.625rem] text-muted-foreground/70 uppercase tracking-widest mb-1.5">
                Suggested Order
              </p>
              <div className="space-y-0.5">
                {result.suggested.map((task, i) => {
                  const currentIdx = result.current.findIndex(
                    (c) => c.id === task.id
                  );
                  const changed = currentIdx !== i;
                  return (
                    <TaskRow
                      key={task.id}
                      task={task}
                      index={i}
                      changed={changed}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* Apply button */}
          <div className="mt-3 flex items-center gap-3">
            {applied ? (
              <span className="flex items-center gap-1 text-xs text-[#7A9E7E]">
                <CheckCircle className="h-3 w-3" />
                Order applied
              </span>
            ) : (
              <button
                onClick={handleApply}
                disabled={applying}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <ArrowRight className="h-3.5 w-3.5" />
                {applying ? "Applying..." : "Apply Suggestion"}
              </button>
            )}
            <button
              onClick={() => {
                setResult(null);
                setApplied(false);
              }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
