"use client";

import { useState } from "react";
import { createTask } from "@/features/tasks/lib/actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { LinkToPicker, type LinkToOption } from "./link-to-picker";

export function CreateTaskDialog({
  projectId,
  courses,
  projects,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: {
  projectId?: string;
  courses?: LinkToOption[];
  projects?: LinkToOption[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = controlledOnOpenChange || setInternalOpen;
  const [loading, setLoading] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projectId || "");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);

    await createTask({
      title: formData.get("title") as string,
      notes: (formData.get("notes") as string) || undefined,
      dueDate: (formData.get("dueDate") as string) || undefined,
      priority: parseInt(formData.get("priority") as string) || 2,
      courseId: selectedCourseId || undefined,
      projectId: selectedProjectId || undefined,
    });

    setLoading(false);
    setOpen(false);
    setSelectedCourseId("");
    setSelectedProjectId("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<button className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors" />}>
          <Plus className="h-4 w-4" />
          New Task
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">New Task</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <label htmlFor="title" className="section-label">
              Title
            </label>
            <input
              id="title"
              name="title"
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="What needs to be done?"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="notes" className="section-label">
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={2}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              placeholder="Optional details..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="dueDate" className="section-label">
                Due Date & Time
              </label>
              <input
                id="dueDate"
                name="dueDate"
                type="datetime-local"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="priority" className="section-label">
                Priority
              </label>
              <select
                id="priority"
                name="priority"
                defaultValue="2"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Task"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
