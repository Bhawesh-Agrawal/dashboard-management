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
import { TaskForm, type TaskFormData } from "./TaskForm";
import type { LinkToOption } from "./link-to-picker";

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

  async function handleSubmit(data: TaskFormData) {
    setLoading(true);
    await createTask({
      title: data.title,
      notes: data.notes,
      dueDate: data.dueDate,
      priority: data.priority,
      courseId: data.courseId,
      projectId: data.projectId,
      estimatedDuration: data.estimatedDuration,
    });
    setLoading(false);
    setOpen(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<button className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors" />}>
          <Plus className="h-4 w-4" />
          New Task
      </DialogTrigger>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">New Task</DialogTitle>
        </DialogHeader>
        <TaskForm
          mode="full"
          projectId={projectId}
          courses={courses}
          projects={projects}
          onSubmit={handleSubmit}
          loading={loading}
        />
      </DialogContent>
    </Dialog>
  );
}
