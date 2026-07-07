"use client";

import { useState } from "react";
import { updateTask, deleteTask } from "@/features/tasks/lib/actions";
import type { TaskWithCourse } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Pencil, Trash2 } from "lucide-react";
import { LinkToPicker, type LinkToOption } from "./link-to-picker";

export function EditTaskDialog({
  task,
  courses,
  projects,
}: {
  task: TaskWithCourse;
  courses?: LinkToOption[];
  projects?: LinkToOption[];
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState<string>(task.courseId || "");
  const [selectedProjectId, setSelectedProjectId] = useState<string>(task.projectId || "");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);

    await updateTask(task.id, {
      title: formData.get("title") as string,
      notes: (formData.get("notes") as string) || undefined,
      dueDate: (formData.get("dueDate") as string) || undefined,
      priority: parseInt(formData.get("priority") as string) || 2,
      courseId: selectedCourseId || null,
      projectId: selectedProjectId || null,
    });

    setLoading(false);
    setOpen(false);
  }

  async function handleDelete() {
    if (!confirm("Delete this task?")) return;
    setLoading(true);
    await deleteTask(task.id);
    setLoading(false);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<button className="p-1 text-muted-foreground hover:text-foreground transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center" />}
      >
        <Pencil className="h-3.5 w-3.5" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Edit Task</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <label htmlFor="edit-title" className="section-label">
              Title
            </label>
            <input
              id="edit-title"
              name="title"
              required
              defaultValue={task.title}
              className="flex h-11 sm:h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="edit-notes" className="section-label">
              Notes
            </label>
            <textarea
              id="edit-notes"
              name="notes"
              rows={2}
              defaultValue={task.notes || ""}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="edit-dueDate" className="section-label">
                Due Date & Time
              </label>
              <input
                id="edit-dueDate"
                name="dueDate"
                type="datetime-local"
                defaultValue={
                  task.dueDate
                    ? new Date(task.dueDate).toISOString().slice(0, 16)
                    : ""
                }
                className="flex h-11 sm:h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="edit-priority" className="section-label">
                Priority
              </label>
              <select
                id="edit-priority"
                name="priority"
                defaultValue={task.priority}
                className="flex h-11 sm:h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="1">High</option>
                <option value="2">Medium</option>
                <option value="3">Low</option>
                <option value="4">Lowest</option>
              </select>
            </div>
          </div>
          {courses && courses.length > 0 && (
            <LinkToPicker
              courses={courses}
              projects={projects || []}
              selectedCourseId={selectedCourseId}
              selectedProjectId={selectedProjectId}
              onCourseChange={setSelectedCourseId}
              onProjectChange={setSelectedProjectId}
            />
          )}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={loading}
              className="inline-flex items-center gap-1 text-sm text-destructive hover:text-destructive/80 transition-colors disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
