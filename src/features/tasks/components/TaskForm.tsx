"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowLeft } from "lucide-react";
import { LinkToPicker, type LinkToOption } from "./link-to-picker";
import { useIsMobile } from "@/lib/use-is-mobile";
import type { TaskWithCourse } from "@/types";

export type TaskFormMode = "quick" | "full";

export interface TaskFormData {
  title: string;
  notes?: string;
  dueDate?: string;
  priority: number;
  courseId?: string;
  projectId?: string;
  estimatedDuration?: number;
  optimalTimeOfDay?: string;
}

interface TaskFormProps {
  mode?: TaskFormMode;
  task?: TaskWithCourse;
  projectId?: string;
  courseId?: string;
  courses?: LinkToOption[];
  projects?: LinkToOption[];
  onSubmit: (data: TaskFormData) => Promise<void>;
  onDone?: () => void;
  loading?: boolean;
  submitLabel?: string;
}

export function TaskForm({
  mode: _mode = "full",
  task,
  projectId,
  courseId,
  courses = [],
  projects = [],
  onSubmit,
  onDone,
  loading = false,
  submitLabel,
}: TaskFormProps) {
  const isEditing = !!task;
  const [selectedCourseId, setSelectedCourseId] = useState<string>(task?.courseId || courseId || "");
  const [selectedProjectId, setSelectedProjectId] = useState<string>(task?.projectId || projectId || "");
  const [step, setStep] = useState(1);
  const isMobile = useIsMobile();
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isMobile) {
      setTimeout(() => titleRef.current?.focus(), 100);
    }
  }, [isMobile, step]);

  function handleReset() {
    setSelectedCourseId(task?.courseId || courseId || "");
    setSelectedProjectId(task?.projectId || projectId || "");
    setStep(1);
    onDone?.();
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    await onSubmit({
      title: formData.get("title") as string,
      notes: (formData.get("notes") as string) || undefined,
      dueDate: (formData.get("dueDate") as string) || undefined,
      priority: parseInt(formData.get("priority") as string) || 2,
      courseId: selectedCourseId || undefined,
      projectId: selectedProjectId || undefined,
      estimatedDuration: formData.get("estimatedDuration")
        ? parseInt(formData.get("estimatedDuration") as string)
        : undefined,
      optimalTimeOfDay: (formData.get("optimalTimeOfDay") as string) || undefined,
    });

    handleReset();
  }

  const hasLinkTo = courses.length > 0;

  const defaultSubmitLabel = isEditing
    ? loading ? "Saving..." : "Save Changes"
    : loading ? "Creating..." : "Create Task";

  return (
    <>
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
              <label htmlFor={`tf-title${isEditing ? `-${task.id}` : ""}`} className="section-label">Title</label>
              <input
                id={`tf-title${isEditing ? `-${task.id}` : ""}`}
                name="title"
                required
                autoFocus
                defaultValue={task?.title}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="What needs to be done?"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor={`tf-notes${isEditing ? `-${task.id}` : ""}`} className="section-label">Notes</label>
              <textarea
                id={`tf-notes${isEditing ? `-${task.id}` : ""}`}
                name="notes"
                rows={2}
                defaultValue={task?.notes || ""}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                placeholder="Optional details..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor={`tf-dueDate${isEditing ? `-${task.id}` : ""}`} className="section-label">Due Date & Time</label>
                <input
                  id={`tf-dueDate${isEditing ? `-${task.id}` : ""}`}
                  name="dueDate"
                  type="datetime-local"
                  defaultValue={
                    task?.dueDate
                      ? new Date(task.dueDate).toISOString().slice(0, 16)
                      : ""
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor={`tf-priority${isEditing ? `-${task.id}` : ""}`} className="section-label">Priority</label>
                <select
                  id={`tf-priority${isEditing ? `-${task.id}` : ""}`}
                  name="priority"
                  defaultValue={task?.priority ?? 2}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="1">High</option>
                  <option value="2">Medium</option>
                  <option value="3">Low</option>
                  <option value="4">Lowest</option>
                </select>
              </div>
            </div>
            <details className="group text-xs">
              <summary className="cursor-pointer section-label py-1 text-muted-foreground hover:text-foreground transition-colors list-none flex items-center gap-1">
                <span>+ More options (Duration, Time)</span>
              </summary>
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border/40 mt-2">
                <div className="space-y-2">
                  <label htmlFor={`tf-estimatedDuration${isEditing ? `-${task.id}` : ""}`} className="section-label">Duration</label>
                  <select
                    id={`tf-estimatedDuration${isEditing ? `-${task.id}` : ""}`}
                    name="estimatedDuration"
                    defaultValue={task?.estimatedDuration?.toString() ?? ""}
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
                  <label htmlFor={`tf-optimalTimeOfDay${isEditing ? `-${task.id}` : ""}`} className="section-label">Best Time</label>
                  <select
                    id={`tf-optimalTimeOfDay${isEditing ? `-${task.id}` : ""}`}
                    name="optimalTimeOfDay"
                    defaultValue={task?.optimalTimeOfDay ?? ""}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Any time</option>
                    <option value="morning">Morning</option>
                    <option value="afternoon">Afternoon</option>
                    <option value="evening">Evening</option>
                  </select>
                </div>
              </div>
            </details>
            {hasLinkTo && (
              <LinkToPicker
                courses={courses}
                projects={projects}
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
              {submitLabel || defaultSubmitLabel}
            </button>
          </>
        )}

        {/* ── Mobile step wizard ── */}
        {isMobile && (
          <>
            {/* Step 1: Core fields */}
            <div hidden={step !== 1} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor={`tf-m-title${isEditing ? `-${task.id}` : ""}`} className="section-label">Title</label>
                <input
                  ref={titleRef}
                  id={`tf-m-title${isEditing ? `-${task.id}` : ""}`}
                  name="title"
                  required
                  autoFocus
                  defaultValue={task?.title}
                  className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="What needs to be done?"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor={`tf-m-notes${isEditing ? `-${task.id}` : ""}`} className="section-label">Notes</label>
                <textarea
                  id={`tf-m-notes${isEditing ? `-${task.id}` : ""}`}
                  name="notes"
                  rows={2}
                  defaultValue={task?.notes || ""}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                  placeholder="Optional details..."
                />
              </div>
              <div className="space-y-2">
                <label htmlFor={`tf-m-dueDate${isEditing ? `-${task.id}` : ""}`} className="section-label">Due Date & Time</label>
                <input
                  id={`tf-m-dueDate${isEditing ? `-${task.id}` : ""}`}
                  name="dueDate"
                  type="datetime-local"
                  defaultValue={
                    task?.dueDate
                      ? new Date(task.dueDate).toISOString().slice(0, 16)
                      : ""
                  }
                  className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor={`tf-m-priority${isEditing ? `-${task.id}` : ""}`} className="section-label">Priority</label>
                <select
                  id={`tf-m-priority${isEditing ? `-${task.id}` : ""}`}
                  name="priority"
                  defaultValue={task?.priority ?? 2}
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

            {/* Step 2: Details + Link to */}
            <div hidden={step !== 2} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor={`tf-m-estimatedDuration${isEditing ? `-${task.id}` : ""}`} className="section-label">Duration</label>
                <select
                  id={`tf-m-estimatedDuration${isEditing ? `-${task.id}` : ""}`}
                  name="estimatedDuration"
                  defaultValue={task?.estimatedDuration?.toString() ?? ""}
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
                <label htmlFor={`tf-m-optimalTimeOfDay${isEditing ? `-${task.id}` : ""}`} className="section-label">Best Time</label>
                <select
                  id={`tf-m-optimalTimeOfDay${isEditing ? `-${task.id}` : ""}`}
                  name="optimalTimeOfDay"
                  defaultValue={task?.optimalTimeOfDay ?? ""}
                  className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Any time</option>
                  <option value="morning">Morning</option>
                  <option value="afternoon">Afternoon</option>
                  <option value="evening">Evening</option>
                </select>
              </div>
              {hasLinkTo && (
                <LinkToPicker
                  courses={courses}
                  projects={projects}
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
                {submitLabel || defaultSubmitLabel}
              </button>
            </div>
          </>
        )}
      </form>
    </>
  );
}
