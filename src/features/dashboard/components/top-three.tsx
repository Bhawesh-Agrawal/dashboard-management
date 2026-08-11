"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import type { TaskWithCourse } from "@/types";
import { useToggleTaskDone, useToggleTaskStarred } from "@/lib/sync/hooks";
import { Star, Check } from "lucide-react";
import { EditTaskDialog } from "@/features/tasks/components/edit-task-dialog";
import { TaskLinkBadge } from "@/features/tasks/components/task-link-badge";

export function TopThree({ tasks }: { tasks: TaskWithCourse[] }) {
  const toggleDone = useToggleTaskDone();
  const toggleStarred = useToggleTaskStarred();

  const [optimisticTasks, updateOptimistic] = useOptimistic(
    tasks,
    (state, { id, field }: { id: string; field: "status" | "starred" }) =>
      state.map((t) =>
        t.id === id
          ? field === "status"
            ? { ...t, status: t.status === "done" ? "open" : "done" }
            : { ...t, starred: !t.starred }
          : t
      )
  );

  const [, startTransition] = useTransition();

  const emptySpots = Math.max(0, 3 - optimisticTasks.length);

  function handleToggleDone(id: string) {
    startTransition(() => {
      updateOptimistic({ id, field: "status" });
      toggleDone(id);
    });
  }

  function handleToggleStar(id: string) {
    startTransition(() => {
      updateOptimistic({ id, field: "starred" });
      toggleStarred(id);
    });
  }

  return (
    <div>
      <p className="section-label mb-3">TOP 3 FOR TODAY</p>
      <div className="space-y-0.5">
        {optimisticTasks.map((task) => (
          <div key={task.id} className="list-row items-center group">
            <button
              onClick={() => handleToggleDone(task.id)}
              className={`shrink-0 h-11 w-11 rounded border transition-colors flex items-center justify-center touch-manipulation ${
                task.status === "done"
                  ? "bg-primary border-primary text-primary-foreground"
                  : "border-border"
              }`}
            >
              {task.status === "done" && <Check className="h-4 w-4" />}
            </button>
            <div className="flex-1 min-w-0">
              <Link
                href={
                  task.course
                    ? `/courses/${task.course.id}`
                    : task.project
                      ? `/projects/${task.project.id}`
                      : "/tasks"
                }
                className="text-sm hover:underline"
              >
                {task.title}
              </Link>
              <div className="flex items-center gap-2 mt-0.5">
                <TaskLinkBadge task={task} />
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleToggleStar(task.id)}
                className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation"
              >
                <Star className={`h-3.5 w-3.5 ${task.starred ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
              </button>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                <EditTaskDialog task={task} />
              </div>
            </div>
          </div>
        ))}

        {/* Empty spots */}
        {Array.from({ length: emptySpots }).map((_, i) => (
          <div key={`empty-${i}`} className="list-row items-center">
            <div className="shrink-0 h-11 w-11 rounded border border-border" />
            <div className="flex-1 min-w-0">
              <span className="text-sm italic text-muted-foreground">(open spot)</span>
            </div>
          </div>
        ))}
      </div>

      {tasks.length === 0 && (
        <p className="text-xs text-muted-foreground mt-2">
          Star a task below to set it as today&apos;s top 3.
        </p>
      )}
    </div>
  );
}
