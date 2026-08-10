"use client";

import { useState } from "react";
import { updateTask } from "@/features/tasks/lib/actions";
import type { TaskWithCourse } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Pencil } from "lucide-react";
import { TaskForm, type TaskFormData } from "./TaskForm";
import type { LinkToOption } from "./link-to-picker";

export function EditTaskDialog({
  task,
  courses,
  projects,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: {
  task: TaskWithCourse;
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
    await updateTask(task.id, {
      title: data.title,
      notes: data.notes,
      dueDate: data.dueDate,
      priority: data.priority,
      courseId: data.courseId || null,
      projectId: data.projectId || null,
      estimatedDuration: data.estimatedDuration || null,
      optimalTimeOfDay: data.optimalTimeOfDay || null,
    });
    setLoading(false);
    setOpen(false);
  }

  const isControlled = controlledOpen !== undefined;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && (
        <DialogTrigger render={<button className="p-1 rounded hover:bg-accent transition-colors" />}>
          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
        </DialogTrigger>
      )}
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Edit Task</DialogTitle>
        </DialogHeader>
        <TaskForm
          mode="full"
          task={task}
          courses={courses}
          projects={projects}
          onSubmit={handleSubmit}
          loading={loading}
        />
      </DialogContent>
    </Dialog>
  );
}
