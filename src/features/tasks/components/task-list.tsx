"use client";

import { toggleTaskDone, toggleTaskStarred } from "@/features/tasks/lib/actions";
import type { TaskWithCourse } from "@/types";
import { Star } from "lucide-react";
import { EditTaskDialog } from "./edit-task-dialog";
import { TaskLinkBadge } from "./task-link-badge";
import type { LinkToOption } from "./link-to-picker";

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
  const isOverdue =
    task.status === "open" &&
    task.dueDate &&
    new Date(task.dueDate) < new Date();

  const dueDateDisplay = task.dueDate
    ? (() => {
        const d = new Date(task.dueDate);
        const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
        return hasTime
          ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
              " " +
              d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
          : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      })()
    : null;

  return (
    <div className="list-row items-center group">
      <button
        onClick={() => toggleTaskDone(task.id)}
        className={`shrink-0 h-11 w-11 rounded border transition-colors flex items-center justify-center ${
          task.status === "done"
            ? "bg-primary border-primary text-primary-foreground"
            : "border-border"
        }`}
      >
        {task.status === "done" && "✓"}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`text-sm ${
              task.status === "done"
                ? "line-through text-muted-foreground"
                : ""
            }`}
          >
            {task.title}
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
          {task.priority === 1 && (
            <span className="text-xs text-destructive font-medium">High</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => toggleTaskStarred(task.id)}
          className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          <Star
            className={`h-3.5 w-3.5 ${
              task.starred
                ? "fill-amber-400 text-amber-400"
                : "text-muted-foreground"
            }`}
          />
        </button>
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <EditTaskDialog task={task} courses={courses} projects={projects} />
        </div>
      </div>
    </div>
  );
}
