"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { Plus, Camera, AlertCircle, ArrowLeft, Sparkles, CheckSquare, FileText } from "lucide-react";
import { createTask, getCoursesForPicker, getProjectsForPicker } from "@/features/tasks/lib/actions";
import { createNote } from "@/features/notes/lib/actions";
import { createBudgetEntry } from "@/features/budget/lib/actions";
import { processOcrAction } from "@/features/notes/lib/actions-ocr";
import { parseQuickCaptureAction } from "@/features/notes/lib/actions-nlp";
import type { ParsedCapture } from "@/features/notes/lib/nlp-parsing";
import { LinkToPicker, type LinkToOption } from "@/features/tasks/components/link-to-picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useIsMobile } from "@/lib/use-is-mobile";

type QuickAddType = "task" | "note" | "budget";
type NoteMode = "text" | "photo";

/**
 * Global floating action button — single FAB, bottom-right on all surfaces.
 * Opens a tabbed dialog for creating Tasks (with Link-to picker), Notes (text + OCR), or Budget entries.
 */
export function FabCluster() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeType, setActiveType] = useState<QuickAddType>("task");
  const [noteMode, setNoteMode] = useState<NoteMode>("text");
  const isMobile = useIsMobile();

  // AI Text parsing state
  const [parsing, startParsingTransition] = useTransition();
  const [parsed, setParsed] = useState<ParsedCapture | null>(null);
  const [rawNoteInput, setRawNoteInput] = useState("");

  // Course/Project state for task creation
  const [courses, setCourses] = useState<LinkToOption[]>([]);
  const [projects, setProjects] = useState<LinkToOption[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");

  // Wizard step for task tab
  const [step, setStep] = useState(1);

  // OCR state for notes
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<string | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [sourceLink, setSourceLink] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch courses and projects when dialog opens
  useEffect(() => {
    if (open && activeType === "task" && courses.length === 0) {
      Promise.all([
        getCoursesForPicker(),
        getProjectsForPicker(),
      ]).then(([c, p]) => {
        setCourses(c);
        setProjects(p);
      }).catch(() => {
        // Silently fail — picker will show empty lists
      });
    }
  }, [open, activeType, courses.length]);

  function resetState() {
    setActiveType("task");
    setNoteMode("text");
    setSelectedCourseId("");
    setSelectedProjectId("");
    setSelectedFile(null);
    setPreviewUrl(null);
    setOcrResult(null);
    setOcrError(null);
    setSourceLink("");
    setStep(1);
    setParsed(null);
    setRawNoteInput("");
  }

  async function handleParse() {
    if (!rawNoteInput.trim()) return;
    startParsingTransition(async () => {
      const result = await parseQuickCaptureAction(rawNoteInput);
      setParsed(result);
    });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);

    try {
      switch (activeType) {
        case "task":
          await createTask({
            title: formData.get("title") as string,
            notes: (formData.get("notes") as string) || undefined,
            dueDate: (formData.get("dueDate") as string) || undefined,
            priority: parseInt(formData.get("priority") as string) || 2,
            courseId: selectedCourseId || undefined,
            projectId: selectedProjectId || undefined,
          });
          break;
        case "note":
          if (noteMode === "text") {
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
            } else {
              await createNote({
                content: rawNoteInput,
              });
            }
          } else if (noteMode === "photo" && ocrResult) {
            await createNote({
              content: ocrResult,
              sourceType: "ocr_photo",
              sourceLink: sourceLink || undefined,
              tags: ["ocr"],
            });
          }
          break;
        case "budget":
          await createBudgetEntry({
            type: formData.get("budgetType") as "income" | "expense",
            amount: parseFloat(formData.get("amount") as string),
            category: formData.get("category") as string,
            date: formData.get("date") as string,
            notes: (formData.get("notes") as string) || undefined,
          });
          break;
      }
    } finally {
      setLoading(false);
      setOpen(false);
      resetState();
    }
  }

  async function handleOcrProcess() {
    if (!selectedFile) return;

    setLoading(true);
    setOcrError(null);

    try {
      const formData = new FormData();
      formData.append("image", selectedFile);
      if (sourceLink) formData.append("sourceLink", sourceLink);

      const result = await processOcrAction(formData);

      if (result.success && result.text) {
        setOcrResult(result.text);
      } else {
        setOcrError(result.error || "Failed to process image");
      }
    } catch (error) {
      setOcrError(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setOcrResult(null);
      setOcrError(null);
    }
  }

  return (
    <>
      {/* FAB button — bottom-right, safe-area aware */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-4 lg:bottom-6 lg:right-6 z-40 h-12 w-12 rounded-full bg-foreground text-background shadow-lg flex items-center justify-center hover:bg-foreground/90 transition-colors active:scale-95"
        style={{ bottom: "max(6rem, calc(6rem + env(safe-area-inset-bottom, 0px)))" }}
      >
        <Plus className="h-5 w-5" />
      </button>

      {/* Quick Add dialog */}
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) resetState();
        }}
      >
        <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">Quick Add</DialogTitle>
          </DialogHeader>

          {/* Type selector */}
          <div className="flex gap-1 mt-4 p-1 bg-muted rounded-md">
            {([
              { value: "task" as const, label: "Task" },
              { value: "note" as const, label: "Note" },
              { value: "budget" as const, label: "Budget" },
            ]).map((tab) => (
              <button
                key={tab.value}
                onClick={() => {
                  setActiveType(tab.value);
                  if (tab.value === "task") setStep(1);
                }}
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

          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            {/* ── Task tab ── */}
            {activeType === "task" && (
              <>
                {/* Mobile step indicator */}
                {isMobile && (
                  <div className="flex items-center justify-between">
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

                {/* Desktop flat layout */}
                {!isMobile && (
                  <>
                    <div className="space-y-2">
                      <label htmlFor="fab-title" className="section-label">
                        What needs to be done?
                      </label>
                      <input
                        id="fab-title"
                        name="title"
                        required
                        autoFocus
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        placeholder="Task title..."
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label htmlFor="fab-dueDate" className="section-label">
                          Due Date & Time
                        </label>
                        <input
                          id="fab-dueDate"
                          name="dueDate"
                          type="datetime-local"
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="fab-priority" className="section-label">
                          Priority
                        </label>
                        <select
                          id="fab-priority"
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
                    <LinkToPicker
                      courses={courses}
                      projects={projects}
                      selectedCourseId={selectedCourseId}
                      selectedProjectId={selectedProjectId}
                      onCourseChange={setSelectedCourseId}
                      onProjectChange={setSelectedProjectId}
                    />
                  </>
                )}

                {/* Mobile step wizard */}
                {isMobile && (
                  <>
                    {/* Step 1: Core fields */}
                    <div hidden={step !== 1} className="space-y-4">
                      <div className="space-y-2">
                        <label htmlFor="fab-m-title" className="section-label">
                          What needs to be done?
                        </label>
                        <input
                          id="fab-m-title"
                          name="title"
                          required
                          autoFocus
                          className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          placeholder="Task title..."
                        />
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="fab-m-dueDate" className="section-label">
                          Due Date & Time
                        </label>
                        <input
                          id="fab-m-dueDate"
                          name="dueDate"
                          type="datetime-local"
                          className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="fab-m-priority" className="section-label">
                          Priority
                        </label>
                        <select
                          id="fab-m-priority"
                          name="priority"
                          defaultValue="2"
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

                    {/* Step 2: Link to */}
                    <div hidden={step !== 2} className="space-y-4">
                      <LinkToPicker
                        courses={courses}
                        projects={projects}
                        selectedCourseId={selectedCourseId}
                        selectedProjectId={selectedProjectId}
                        onCourseChange={setSelectedCourseId}
                        onProjectChange={setSelectedProjectId}
                      />
                    </div>
                  </>
                )}
              </>
            )}

            {activeType === "note" && (
              <>
                {/* Note mode tabs */}
                <div className="flex gap-1 p-1 bg-muted rounded-md">
                  <button
                    type="button"
                    onClick={() => setNoteMode("text")}
                    className={`flex-1 py-1.5 text-sm rounded transition-colors ${
                      noteMode === "text"
                        ? "bg-background text-foreground font-medium shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Text
                  </button>
                  <button
                    type="button"
                    onClick={() => setNoteMode("photo")}
                    className={`flex-1 py-1.5 text-sm rounded transition-colors ${
                      noteMode === "photo"
                        ? "bg-background text-foreground font-medium shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Camera className="h-4 w-4 inline mr-1" />
                    Photo (OCR)
                  </button>
                </div>

                {/* Text mode */}
                {noteMode === "text" && !parsed && (
                  <div className="space-y-4">
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
                {noteMode === "text" && parsed && (
                  <div className="space-y-4">
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
                    <div className="flex justify-start">
                      <button
                        type="button"
                        onClick={() => setParsed(null)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Edit Input
                      </button>
                    </div>
                  </div>
                )}

                {/* Photo mode */}
                {noteMode === "photo" && !ocrResult && (
                  <div className="space-y-3">
                    <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                      <AlertCircle className="h-3 w-3 inline mr-1" />
                      Transcription may need cleanup, especially for handwriting.
                    </div>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full h-24 border-2 border-dashed border-border rounded-md flex flex-col items-center justify-center gap-2 hover:bg-muted/50 transition-colors"
                    >
                      <Camera className="h-6 w-6 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {selectedFile ? selectedFile.name : "Click to select photo"}
                      </span>
                    </button>

                    {previewUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={previewUrl}
                        alt="Preview"
                        className="max-h-24 rounded-md border border-border"
                      />
                    )}

                    <div className="space-y-2">
                      <label htmlFor="fab-sourceLink" className="section-label">
                        Source Link (optional)
                      </label>
                      <input
                        id="fab-sourceLink"
                        type="url"
                        value={sourceLink}
                        onChange={(e) => setSourceLink(e.target.value)}
                        placeholder="OneDrive share link"
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>

                    {ocrError && (
                      <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                        {ocrError}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleOcrProcess}
                      disabled={!selectedFile || loading}
                      className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
                    >
                      <Camera className="h-4 w-4" />
                      {loading ? "Processing..." : "Transcribe"}
                    </button>
                  </div>
                )}

                {/* OCR result */}
                {noteMode === "photo" && ocrResult && (
                  <div className="space-y-2">
                    <div className="rounded-md border border-input bg-muted/50 p-3">
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {ocrResult}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setOcrResult(null);
                        setSelectedFile(null);
                        setPreviewUrl(null);
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Try another photo
                    </button>
                  </div>
                )}
              </>
            )}

            {activeType === "budget" && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="fab-budgetType" className="section-label">Type</label>
                    <select
                      id="fab-budgetType"
                      name="budgetType"
                      className="flex h-11 sm:h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="expense">Expense</option>
                      <option value="income">Income</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="fab-amount" className="section-label">Amount</label>
                    <input
                      id="fab-amount"
                      name="amount"
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      autoFocus
                      className="flex h-11 sm:h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="fab-category" className="section-label">Category</label>
                    <select
                      id="fab-category"
                      name="category"
                      required
                      className="flex h-11 sm:h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="Food">Food</option>
                      <option value="Transport">Transport</option>
                      <option value="Books">Books</option>
                      <option value="Subscriptions">Subscriptions</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="fab-date" className="section-label">Date</label>
                    <input
                      id="fab-date"
                      name="date"
                      type="date"
                      required
                      defaultValue={new Date().toISOString().split("T")[0]}
                      className="flex h-11 sm:h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label htmlFor="fab-notes" className="section-label">Notes</label>
                  <input
                    id="fab-notes"
                    name="notes"
                    className="flex h-11 sm:h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder="Optional notes..."
                  />
                </div>
              </>
            )}

            {/* Submit button — shown inline on desktop, or as part of step 2 on mobile task tab */}
            {(!isMobile || activeType !== "task") && (
              <button
                type="submit"
                disabled={loading || (activeType === "note" && noteMode === "photo" && !ocrResult)}
                className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {loading
                  ? "Adding..."
                  : activeType === "task"
                    ? "Add Task"
                    : activeType === "note"
                      ? noteMode === "photo" ? "Save OCR Note" : "Add Note"
                      : "Add Entry"}
              </button>
            )}
            {isMobile && activeType === "task" && step === 2 && (
              <button
                type="submit"
                disabled={loading}
                className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {loading ? "Adding..." : "Add Task"}
              </button>
            )}
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
