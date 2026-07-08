"use client";

import { useState, useOptimistic, useTransition } from "react";
import { createTask } from "@/features/tasks/lib/actions";
import type { Task } from "@prisma/client";
import { toggleTaskDone } from "@/features/tasks/lib/actions";

export function CourseTasksSection({
  courseId,
  tasks,
}: {
  courseId: string;
  tasks: Task[];
}) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="section-label">Tasks</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          + Add
        </button>
      </div>

      {showForm && (
        <AddTaskForm courseId={courseId} onDone={() => setShowForm(false)} />
      )}

      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tasks for this course.</p>
      ) : (
        <CourseTaskList tasks={tasks} />
      )}
    </div>
  );
}

function AddTaskForm({
  courseId,
  onDone,
}: {
  courseId: string;
  onDone: () => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);

    await createTask({
      title: formData.get("title") as string,
      courseId,
      dueDate: (formData.get("dueDate") as string) || undefined,
    });

    setLoading(false);
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-3 p-3 rounded-md border border-border bg-card mb-3">
      <div className="flex-1 space-y-1">
        <input
          name="title"
          required
          placeholder="Task title..."
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
        />
      </div>
      <div className="space-y-1">
        <input
          name="dueDate"
          type="date"
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 touch-manipulation"
      >
        {loading ? "..." : "Add"}
      </button>
    </form>
  );
}

function CourseTaskList({ tasks }: { tasks: Task[] }) {
  const [optimisticTasks, updateOptimistic] = useOptimistic(
    tasks,
    (state, { id }: { id: string }) =>
      state.map((t) =>
        t.id === id
          ? { ...t, status: t.status === "done" ? "open" : "done" }
          : t
      )
  );
  const [, startTransition] = useTransition();

  function handleToggle(id: string) {
    startTransition(() => {
      updateOptimistic({ id });
      toggleTaskDone(id);
    });
  }

  return (
    <div className="space-y-0.5">
      {optimisticTasks.map((task) => (
        <div key={task.id} className="list-row items-center">
          <button
            onClick={() => handleToggle(task.id)}
            className={`shrink-0 h-4 w-4 rounded border transition-colors touch-manipulation ${
              task.status === "done"
                ? "bg-primary border-primary text-primary-foreground"
                : "border-border"
            }`}
          >
            {task.status === "done" && "✓"}
          </button>
          <div className="flex-1 min-w-0">
            <span className={`text-sm ${task.status === "done" ? "line-through text-muted-foreground" : ""}`}>
              {task.title}
            </span>
            {task.dueDate && (
              <span className="text-xs text-muted-foreground ml-2">
                Due {new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
