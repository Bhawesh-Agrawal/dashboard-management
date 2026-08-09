"use client";

import { useState, useOptimistic, useTransition } from "react";
import { createTask } from "@/features/tasks/lib/actions";
import type { Task } from "@prisma/client";
import { toggleTaskDone } from "@/features/tasks/lib/actions";
import { TaskForm, type TaskFormData } from "@/features/tasks/components/TaskForm";

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
          {showForm ? "Cancel" : "+ Add"}
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

  async function handleSubmit(data: TaskFormData) {
    setLoading(true);
    await createTask({
      title: data.title,
      courseId,
      dueDate: data.dueDate,
      priority: data.priority,
    });
    setLoading(false);
    onDone();
  }

  return (
    <div className="p-3 rounded-md border border-border bg-card mb-3">
      <TaskForm
        mode="quick"
        courseId={courseId}
        onSubmit={handleSubmit}
        onDone={onDone}
        loading={loading}
        submitLabel={loading ? "..." : "Add Task"}
      />
    </div>
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
