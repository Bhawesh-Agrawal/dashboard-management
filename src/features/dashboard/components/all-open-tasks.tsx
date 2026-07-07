"use client";

import Link from "next/link";
import type { TaskWithCourse } from "@/types";
import { toggleTaskDone, toggleTaskStarred } from "@/features/tasks/lib/actions";
import { Star } from "lucide-react";
import { TaskLinkBadge } from "@/features/tasks/components/task-link-badge";

export function AllOpenTasks({ tasks }: { tasks: TaskWithCourse[] }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="section-label">ALL OPEN TASKS · {tasks.length}</p>
        <Link
          href="/tasks"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          View all
        </Link>
      </div>
      <div className="space-y-0.5">
        {tasks.map((task) => (
          <div key={task.id} className="list-row items-center group">
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
          </div>
        ))}
      </div>
    </div>
  );
}
