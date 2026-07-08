"use client";

import { useState, useOptimistic, useTransition } from "react";
import { toggleTaskDone, toggleTaskStarred, deleteTask } from "@/features/tasks/lib/actions";
import type { TaskWithCourse } from "@/types";
import { Star } from "lucide-react";
import { EditTaskDialog } from "./edit-task-dialog";
import { TaskLinkBadge } from "./task-link-badge";
import type { LinkToOption } from "./link-to-picker";
import { SwipeToReveal } from "@/components/shared/swipe-to-reveal";

export function TaskList({
  tasks,
  courses,
  projects,
}: {
  tasks: TaskWithCourse[];
  courses?: LinkToOption[];
  projects?: LinkToOption[];
}) {
  const openTasks = tasks.filter((t) => t.status === "open");
  const doneTasks = tasks.filter((t) => t.status === "done");

  return (
    <div className="space-y-6">
      {openTasks.length > 0 && (
        <div>
          <p className="section-label mb-2">Open · {openTasks.length}</p>
          <div className="space-y-0.5">
            {openTasks.map((task) => (
              <TaskRow key={task.id} task={task} courses={courses} projects={projects} />
            ))}
          </div>
        </div>
      )}

      {doneTasks.length > 0 && (
        <div>
          <p className="section-label mb-2">Done · {doneTasks.length}</p>
          <div className="space-y-0.5">
            {doneTasks.map((task) => (
              <TaskRow key={task.id} task={task} courses={courses} projects={projects} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TaskRow({
  task,
  courses,
  projects,
}: {
  task: TaskWithCourse;
  courses?: LinkToOption[];
  projects?: LinkToOption[];
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [, startTransition] = useTransition();

  // Optimistic local state — UI reflects changes immediately
  const [optimisticTask, updateOptimistic] = useOptimistic(
    task,
    (current, update: Partial<TaskWithCourse>) => ({ ...current, ...update })
  );

  const isOverdue =
    optimisticTask.status === "open" &&
    optimisticTask.dueDate &&
    new Date(optimisticTask.dueDate) < new Date();

  const dueDateDisplay = optimisticTask.dueDate
    ? (() => {
        const d = new Date(optimisticTask.dueDate!);
        const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
        return hasTime
          ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
              " " +
              d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
          : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      })()
    : null;

  function handleToggleDone() {
    startTransition(() => {
      updateOptimistic({ status: optimisticTask.status === "done" ? "open" : "done" });
      toggleTaskDone(task.id);
    });
  }

  function handleToggleStar() {
    startTransition(() => {
      updateOptimistic({ starred: !optimisticTask.starred });
      toggleTaskStarred(task.id);
    });
  }

  function handleDelete() {
    if (confirm("Delete this task?")) {
      deleteTask(task.id);
    }
  }

  return (
    <>
      <SwipeToReveal
        onEdit={() => setEditOpen(true)}
        onDelete={handleDelete}
      >
        <div className="list-row items-center">
          <button
            onClick={handleToggleDone}
            className={`shrink-0 h-11 w-11 rounded border transition-colors flex items-center justify-center touch-manipulation ${
              optimisticTask.status === "done"
                ? "bg-primary border-primary text-primary-foreground"
                : "border-border"
            }`}
          >
            {optimisticTask.status === "done" && "✓"}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`text-sm ${
                  optimisticTask.status === "done"
                    ? "line-through text-muted-foreground"
                    : ""
                }`}
              >
                {optimisticTask.title}
              </span>
              {isOverdue && (
                <span className="overdue-badge">Overdue</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <TaskLinkBadge task={task} />
              {dueDateDisplay && (
                <span className="text-xs text-muted-foreground">
                  Due {dueDateDisplay}
                </span>
              )}
              {optimisticTask.priority === 1 && (
                <span className="text-xs text-destructive font-medium">High</span>
              )}
            </div>
          </div>

          <button
            onClick={handleToggleStar}
            className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0 touch-manipulation"
          >
            <Star
              className={`h-3.5 w-3.5 ${
                optimisticTask.starred
                  ? "fill-amber-400 text-amber-400"
                  : "text-muted-foreground"
              }`}
            />
          </button>
        </div>
      </SwipeToReveal>

      <EditTaskDialog
        task={task}
        courses={courses}
        projects={projects}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </>
  );
}
