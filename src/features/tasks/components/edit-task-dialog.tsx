"use client";

import { useState, useEffect } from "react";
import { updateTask } from "@/features/tasks/lib/actions";
import type { TaskWithCourse } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft } from "lucide-react";
import { LinkToPicker, type LinkToOption } from "./link-to-picker";
import { useIsMobile } from "@/lib/use-is-mobile";

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
  const [selectedCourseId, setSelectedCourseId] = useState<string>(task.courseId || "");
  const [selectedProjectId, setSelectedProjectId] = useState<string>(task.projectId || "");
  const [step, setStep] = useState(1);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (open) {
      setSelectedCourseId(task.courseId || "");
      setSelectedProjectId(task.projectId || "");
    }
  }, [open, task.courseId, task.projectId]);

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
      energyRequirement: (formData.get("energyRequirement") as string) || null,
      estimatedDuration: formData.get("estimatedDuration")
        ? parseInt(formData.get("estimatedDuration") as string)
        : null,
      optimalTimeOfDay: (formData.get("optimalTimeOfDay") as string) || null,
    });

    setLoading(false);
    setOpen(false);
    setStep(1);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setStep(1);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Edit Task</DialogTitle>
        </DialogHeader>

        {/* Mobile step indicator */}
        {isMobile && (
          <div className="flex items-center justify-between mt-2">
            <span className="section-label">
              Step {step} of 2
            </span>
            {step === 2 && (
              <button
                type="button"
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-3 w-3" />
                Back
              </button>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* ── Desktop flat layout ── */}
          {!isMobile && (
            <>
              <div className="space-y-2">
                <label htmlFor="edit-title" className="section-label">Title</label>
                <input
                  id="edit-title"
                  name="title"
                  required
                  defaultValue={task.title}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="edit-notes" className="section-label">Notes</label>
                <textarea
                  id="edit-notes"
                  name="notes"
                  rows={2}
                  defaultValue={task.notes || ""}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="edit-dueDate" className="section-label">Due Date & Time</label>
                  <input
                    id="edit-dueDate"
                    name="dueDate"
                    type="datetime-local"
                    defaultValue={
                      task.dueDate
                        ? new Date(task.dueDate).toISOString().slice(0, 16)
                        : ""
                    }
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="edit-priority" className="section-label">Priority</label>
                  <select
                    id="edit-priority"
                    name="priority"
                    defaultValue={task.priority}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="1">High</option>
                    <option value="2">Medium</option>
                    <option value="3">Low</option>
                    <option value="4">Lowest</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label htmlFor="edit-energyRequirement" className="section-label">Energy Level</label>
                  <select
                    id="edit-energyRequirement"
                    name="energyRequirement"
                    defaultValue={task.energyRequirement ?? ""}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Not set</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="edit-estimatedDuration" className="section-label">Duration</label>
                  <select
                    id="edit-estimatedDuration"
                    name="estimatedDuration"
                    defaultValue={task.estimatedDuration?.toString() ?? ""}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Not set</option>
                    <option value="15">15 min</option>
                    <option value="30">30 min</option>
                    <option value="60">1 hour</option>
                    <option value="120">2 hours</option>
                    <option value="240">4 hours</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="edit-optimalTimeOfDay" className="section-label">Best Time</label>
                  <select
                    id="edit-optimalTimeOfDay"
                    name="optimalTimeOfDay"
                    defaultValue={task.optimalTimeOfDay ?? ""}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Any time</option>
                    <option value="morning">Morning</option>
                    <option value="afternoon">Afternoon</option>
                    <option value="evening">Evening</option>
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
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {loading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </>
          )}

          {/* ── Mobile step wizard ── */}
          {isMobile && (
            <>
              {/* Step 1: What */}
              <div hidden={step !== 1} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="m-edit-title" className="section-label">Title</label>
                  <input
                    id="m-edit-title"
                    name="title"
                    required
                    defaultValue={task.title}
                    className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="m-edit-notes" className="section-label">Notes</label>
                  <textarea
                    id="m-edit-notes"
                    name="notes"
                    rows={2}
                    defaultValue={task.notes || ""}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="m-edit-dueDate" className="section-label">Due Date & Time</label>
                  <input
                    id="m-edit-dueDate"
                    name="dueDate"
                    type="datetime-local"
                    defaultValue={
                      task.dueDate
                        ? new Date(task.dueDate).toISOString().slice(0, 16)
                        : ""
                    }
                    className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="m-edit-priority" className="section-label">Priority</label>
                  <select
                    id="m-edit-priority"
                    name="priority"
                    defaultValue={task.priority}
                    className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="1">High</option>
                    <option value="2">Medium</option>
                    <option value="3">Low</option>
                    <option value="4">Lowest</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Next
                </button>
              </div>

              {/* Step 2: Details */}
              <div hidden={step !== 2} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="m-edit-energyRequirement" className="section-label">Energy Level</label>
                  <select
                    id="m-edit-energyRequirement"
                    name="energyRequirement"
                    defaultValue={task.energyRequirement ?? ""}
                    className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Not set</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="m-edit-estimatedDuration" className="section-label">Duration</label>
                  <select
                    id="m-edit-estimatedDuration"
                    name="estimatedDuration"
                    defaultValue={task.estimatedDuration?.toString() ?? ""}
                    className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Not set</option>
                    <option value="15">15 min</option>
                    <option value="30">30 min</option>
                    <option value="60">1 hour</option>
                    <option value="120">2 hours</option>
                    <option value="240">4 hours</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="m-edit-optimalTimeOfDay" className="section-label">Best Time</label>
                  <select
                    id="m-edit-optimalTimeOfDay"
                    name="optimalTimeOfDay"
                    defaultValue={task.optimalTimeOfDay ?? ""}
                    className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Any time</option>
                    <option value="morning">Morning</option>
                    <option value="afternoon">Afternoon</option>
                    <option value="evening">Evening</option>
                  </select>
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
                  className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {loading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
