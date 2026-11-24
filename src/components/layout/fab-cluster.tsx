"use client";

import { useState, useEffect, useTransition } from "react";
import { Plus, Sparkles, CheckSquare, FileText } from "lucide-react";
import { createTask, getCoursesForPicker, getProjectsForPicker } from "@/features/tasks/lib/actions";
import { createNote } from "@/features/notes/lib/actions";
import { parseQuickCaptureAction } from "@/features/notes/lib/actions-nlp";
import type { ParsedCapture } from "@/features/notes/lib/nlp-parsing";
import type { LinkToOption } from "@/features/tasks/components/link-to-picker";
import { TaskForm, type TaskFormData } from "@/features/tasks/components/TaskForm";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type QuickAddType = "task" | "note";

export function FabCluster() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeType, setActiveType] = useState<QuickAddType>("task");

  // AI Text parsing state
  const [parsing, startParsingTransition] = useTransition();
  const [parsed, setParsed] = useState<ParsedCapture | null>(null);
  const [rawNoteInput, setRawNoteInput] = useState("");

  // Course/Project state for task creation
  const [courses, setCourses] = useState<LinkToOption[]>([]);
  const [projects, setProjects] = useState<LinkToOption[]>([]);

  useEffect(() => {
    if (open && activeType === "task" && courses.length === 0) {
      Promise.all([
        getCoursesForPicker(),
        getProjectsForPicker(),
      ]).then(([c, p]) => {
        setCourses(c);
        setProjects(p);
      }).catch(() => {});
    }
  }, [open, activeType, courses.length]);

  function resetState() {
    setActiveType("task");
    setParsed(null);
    setRawNoteInput("");
  }

  function handleClose(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) resetState();
  }

  async function handleParse() {
    if (!rawNoteInput.trim()) return;
    startParsingTransition(async () => {
      const result = await parseQuickCaptureAction(rawNoteInput);
      setParsed(result);
    });
  }

  async function handleTaskSubmit(data: TaskFormData) {
    setLoading(true);
    try {
      await createTask({
        title: data.title,
        notes: data.notes,
        dueDate: data.dueDate,
        priority: data.priority,
        courseId: data.courseId,
        projectId: data.projectId,
        estimatedDuration: data.estimatedDuration,
      });
    } finally {
      setLoading(false);
      handleClose(false);
    }
  }

  async function handleNoteSave() {
    setLoading(true);
    try {
      if (parsed) {
        if (parsed.type === "task" && parsed.title) {
          await createTask({
            title: parsed.title,
            notes: parsed.content,
            dueDate: parsed.dueDate || undefined,
            courseId: parsed.courseId || undefined,
            priority: 2,
          });
        } else {
          await createNote({
            content: parsed.content,
            tags: parsed.tags,
            courseId: parsed.courseId || undefined,
          });
        }
      }
    } finally {
      setLoading(false);
      handleClose(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-4 lg:bottom-6 lg:right-6 z-40 h-12 w-12 rounded-full bg-foreground text-background shadow-lg flex items-center justify-center hover:bg-foreground/90 transition-colors active:scale-95"
        style={{ bottom: "max(7rem, calc(7rem + env(safe-area-inset-bottom, 0px)))" }}
      >
        <Plus className="h-5 w-5" />
      </button>

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">Quick Add</DialogTitle>
          </DialogHeader>

          <div className="flex gap-1 mt-4 p-1 bg-muted rounded-md">
            {([
              { value: "task" as const, label: "Task" },
              { value: "note" as const, label: "Note" },
            ]).map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveType(tab.value)}
                className={`flex-1 py-1.5 text-sm rounded transition-colors ${
                  activeType === tab.value
                    ? "bg-background text-foreground font-medium shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Task tab — delegates to shared TaskForm */}
          {activeType === "task" && (
            <TaskForm
              mode="quick"
              courses={courses}
              projects={projects}
              onSubmit={handleTaskSubmit}
              loading={loading}
              submitLabel={loading ? "Adding..." : "Add Task"}
            />
          )}

          {/* Note tab — AI parse */}
          {activeType === "note" && (
            <>
              {!parsed && (
                <div className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <label htmlFor="fab-content" className="section-label">
                      What&apos;s on your mind? (Parse with AI)
                    </label>
                    <textarea
                      id="fab-content"
                      name="content"
                      required={!parsed}
                      autoFocus
                      rows={4}
                      value={rawNoteInput}
                      onChange={(e) => setRawNoteInput(e.target.value)}
                      className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                      placeholder="Type a quick note..."
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          handleParse();
                        }
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      Press ⌘+Enter to parse with AI
                    </p>
                    <button
                      type="button"
                      onClick={handleParse}
                      disabled={!rawNoteInput.trim() || parsing}
                      className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-secondary text-secondary-foreground text-sm hover:bg-secondary/80 disabled:opacity-50"
                    >
                      <Sparkles className="h-4 w-4" />
                      {parsing ? "Parsing..." : "AI Parse"}
                    </button>
                  </div>
                </div>
              )}

              {parsed && (
                <div className="space-y-4 mt-4">
                  <div className="rounded-md border border-input bg-muted/50 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      {parsed.type === "task" ? (
                        <CheckSquare className="h-4 w-4 text-amber-600" />
                      ) : (
                        <FileText className="h-4 w-4 text-blue-600" />
                      )}
                      <span className="text-sm font-medium capitalize">
                        {parsed.type}
                      </span>
                      {parsed.courseName && (
                        <span className="text-xs bg-muted rounded px-1.5 py-0.5">
                          {parsed.courseName}
                        </span>
                      )}
                    </div>
                    {parsed.title && (
                      <p className="text-sm font-medium mb-1">{parsed.title}</p>
                    )}
                    <p className="text-sm text-muted-foreground mb-2">
                      {parsed.content}
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {parsed.dueDate && (
                        <span className="bg-muted rounded px-1.5 py-0.5">
                          Due: {new Date(parsed.dueDate).toLocaleDateString()}
                        </span>
                      )}
                      {parsed.tags.map((tag) => (
                        <span key={tag} className="bg-muted rounded px-1.5 py-0.5">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setParsed(null)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Edit Input
                    </button>
                    <button
                      type="button"
                      onClick={handleNoteSave}
                      disabled={loading}
                      className="inline-flex h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
                    >
                      {loading ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
