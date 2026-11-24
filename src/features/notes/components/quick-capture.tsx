"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { createTask } from "@/features/tasks/lib/actions";
import { createNote } from "@/features/notes/lib/actions";
import { parseQuickCaptureAction } from "@/features/notes/lib/actions-nlp";
import { getCoursesForPicker } from "@/features/tasks/lib/actions";
import { getFolders } from "@/features/notes/lib/actions-folders";
import type { ParsedCapture } from "@/features/notes/lib/nlp-parsing";
import type { LinkToOption } from "@/features/tasks/components/link-to-picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FileUploadDialog } from "@/features/files/components/FileUploadDialog";
import { getUploadContextOptions } from "@/features/files/lib/actions";
import { Plus, Sparkles, FileText, CheckSquare, Paperclip } from "lucide-react";

type CaptureMode = "text" | "file";

type ContextType = "notes" | "course" | "semester";

type SemesterOption = { id: string; name: string };
type CourseOption = { id: string; name: string; code: string | null; semesterId: string };
type FolderOption = { id: string; name: string; type: string; _count: { notes: number; children: number } };

export function QuickCapture({
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
} = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = controlledOnOpenChange || setInternalOpen;
  const [loading, setLoading] = useState(false);
  const [parsing, startParsingTransition] = useTransition();
  const [parsed, setParsed] = useState<ParsedCapture | null>(null);
  const [rawInput, setRawInput] = useState("");

  const [mode, setMode] = useState<CaptureMode>("text");
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);

  // "More options" state
  const [manualTags, setManualTags] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [selectedFolderId, setSelectedFolderId] = useState<string>("");

  // Course/folder options for More options
  const [courses, setCourses] = useState<LinkToOption[]>([]);
  const [folders, setFolders] = useState<FolderOption[]>([]);
  const [optionsLoaded, setOptionsLoaded] = useState(false);

  // File upload context state
  const [uploadContext, setUploadContext] = useState<ContextType>("notes");
  const [fileSelectedCourseId, setFileSelectedCourseId] = useState<string>("");
  const [selectedSemesterId, setSelectedSemesterId] = useState<string>("");
  const [semesterOptions, setSemesterOptions] = useState<SemesterOption[]>([]);
  const [courseOptions, setCourseOptions] = useState<CourseOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  // Fetch courses/folders when dialog opens (lazy)
  useEffect(() => {
    if (open && !optionsLoaded) {
      Promise.all([
        getCoursesForPicker(),
        getFolders(),
      ]).then(([c, f]) => {
        setCourses(c);
        setFolders(f);
        setOptionsLoaded(true);
      }).catch(() => {});
    }
  }, [open, optionsLoaded]);

  // Fetch semester/course options when File tab is opened
  useEffect(() => {
    let cancelled = false;
    async function loadOptions() {
      setLoadingOptions(true);
      try {
        const options = await getUploadContextOptions();
        if (!cancelled) {
          setSemesterOptions(options.semesters);
          setCourseOptions(options.courses);
        }
      } catch (e) {
        console.error(e);
      }
      if (!cancelled) setLoadingOptions(false);
    }
    if (mode === "file" && semesterOptions.length === 0) {
      loadOptions();
    }
    return () => { cancelled = true; };
  }, [mode, semesterOptions.length]);

  // Filter courses by selected semester
  const filteredCourses = selectedSemesterId
    ? courseOptions.filter((c) => c.semesterId === selectedSemesterId)
    : courseOptions;

  async function handleParse() {
    if (!rawInput.trim()) return;

    startParsingTransition(async () => {
      const result = await parseQuickCaptureAction(rawInput);
      setParsed(result);
    });
  }

  function parseManualTags(): string[] {
    return manualTags
      ? manualTags.split(",").map((t) => t.trim()).filter(Boolean)
      : [];
  }

  async function handleSave() {
    setLoading(true);

    try {
      if (mode === "text" && parsed) {
        if (parsed.type === "task" && parsed.title) {
          await createTask({
            title: parsed.title,
            notes: parsed.content,
            dueDate: parsed.dueDate || undefined,
            courseId: parsed.courseId || selectedCourseId || undefined,
            priority: 2,
          });
        } else {
          const mergedTags = [...new Set([...parsed.tags, ...parseManualTags()])];
          await createNote({
            content: parsed.content,
            tags: mergedTags.length > 0 ? mergedTags : undefined,
            courseId: parsed.courseId || selectedCourseId || undefined,
            folderId: selectedFolderId || undefined,
          });
        }
      } else if (mode === "text" && !parsed && rawInput.trim()) {
        const mergedTags = parseManualTags();
        await createNote({
          content: rawInput,
          tags: mergedTags.length > 0 ? mergedTags : undefined,
          courseId: selectedCourseId || undefined,
          folderId: selectedFolderId || undefined,
        });
      }

      // Reset and close
      resetState();
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  function resetState() {
    setParsed(null);
    setRawInput("");
    setMode("text");
    setManualTags("");
    setSelectedCourseId("");
    setSelectedFolderId("");
    setUploadContext("notes");
    setFileSelectedCourseId("");
    setSelectedSemesterId("");
  }

  function handleReset() {
    setParsed(null);
    setRawInput("");
  }

  // Build FileUploadDialog props based on context
  const fileUploadProps = {
    open: uploadDialogOpen,
    onOpenChange: setUploadDialogOpen,
    semesterId: uploadContext === "semester" ? selectedSemesterId : undefined,
    courseId: uploadContext === "course" ? fileSelectedCourseId : undefined,
    semesterName: semesterOptions.find((s) => s.id === selectedSemesterId)?.name,
    courseName: courseOptions.find((c) => c.id === fileSelectedCourseId)?.name,
    onUploadComplete: () => {
      setUploadDialogOpen(false);
      resetState();
      setOpen(false);
    },
  };

  const hasMoreOptions = courses.length > 0 || folders.length > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          resetState();
        }
      }}
    >
      <DialogTrigger
        render={
          <button className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors min-h-[44px] sm:min-h-0 sm:h-auto sm:w-auto" />
        }
      >
        <Plus className="h-4 w-4" />
        <span className="hidden sm:inline">Quick Capture</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg w-[calc(100%-2rem)]">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Quick Capture</DialogTitle>
        </DialogHeader>

        {/* Mode tabs */}
        <div className="flex gap-1 p-1 bg-muted rounded-md mt-4">
          <button
            onClick={() => setMode("text")}
            className={`flex-1 px-3 py-2.5 sm:py-1.5 text-sm rounded transition-colors min-h-[44px] sm:min-h-0 ${
              mode === "text"
                ? "bg-background text-foreground font-medium shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles className="h-4 w-4 inline mr-1" />
            Text (AI)
          </button>
          <button
            onClick={() => setMode("file")}
            className={`flex-1 px-3 py-2.5 sm:py-1.5 text-sm rounded transition-colors min-h-[44px] sm:min-h-0 ${
              mode === "file"
                ? "bg-background text-foreground font-medium shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Paperclip className="h-4 w-4 inline mr-1" />
            File
          </button>
        </div>

        {/* Text mode */}
        {mode === "text" && !parsed && (
          <div className="space-y-4 mt-4">
            <textarea
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              rows={4}
              placeholder='Try: "assignment 3 due friday physics"'
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  handleParse();
                }
              }}
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Press ⌘+Enter to parse with AI
              </p>
              <button
                type="button"
                onClick={handleParse}
                disabled={!rawInput.trim() || parsing}
                className="inline-flex items-center gap-2 h-10 sm:h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 min-h-[44px] sm:min-h-0"
              >
                <Sparkles className="h-4 w-4" />
                {parsing ? "Parsing..." : "Parse"}
              </button>
            </div>

            {/* More options */}
            {hasMoreOptions && (
              <details className="text-xs">
                <summary className="cursor-pointer section-label py-1 text-muted-foreground hover:text-foreground transition-colors list-none flex items-center gap-1">
                  <span>+ More options (Tags, Course, Folder)</span>
                </summary>
                <div className="space-y-3 pt-2 border-t border-border/40 mt-2">
                  <div className="space-y-2">
                    <label htmlFor="qc-text-tags" className="section-label">Tags</label>
                    <input
                      id="qc-text-tags"
                      type="text"
                      value={manualTags}
                      onChange={(e) => setManualTags(e.target.value)}
                      placeholder="comma-separated tags..."
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  {courses.length > 0 && (
                    <div className="space-y-2">
                      <label htmlFor="qc-text-course" className="section-label">Course</label>
                      <select
                        id="qc-text-course"
                        value={selectedCourseId}
                        onChange={(e) => setSelectedCourseId(e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">None</option>
                        {courses.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {folders.length > 0 && (
                    <div className="space-y-2">
                      <label htmlFor="qc-text-folder" className="section-label">Folder</label>
                      <select
                        id="qc-text-folder"
                        value={selectedFolderId}
                        onChange={(e) => setSelectedFolderId(e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">None</option>
                        {folders.map((f) => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </details>
            )}

            {/* Save button for un-parsed text */}
            {!parsed && rawInput.trim() && (
              <button
                type="button"
                onClick={handleSave}
                disabled={loading}
                className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
              >
                {loading ? "Saving..." : "Save as Note"}
              </button>
            )}
          </div>
        )}

        {/* Text mode - parsed result */}
        {mode === "text" && parsed && (
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

            {/* More options for parsed text */}
            {hasMoreOptions && (
              <details className="text-xs">
                <summary className="cursor-pointer section-label py-1 text-muted-foreground hover:text-foreground transition-colors list-none flex items-center gap-1">
                  <span>+ More options (Tags, Course, Folder)</span>
                </summary>
                <div className="space-y-3 pt-2 border-t border-border/40 mt-2">
                  <div className="space-y-2">
                    <label htmlFor="qc-parsed-tags" className="section-label">Additional Tags</label>
                    <input
                      id="qc-parsed-tags"
                      type="text"
                      value={manualTags}
                      onChange={(e) => setManualTags(e.target.value)}
                      placeholder="comma-separated tags..."
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  {courses.length > 0 && (
                    <div className="space-y-2">
                      <label htmlFor="qc-parsed-course" className="section-label">Course</label>
                      <select
                        id="qc-parsed-course"
                        value={selectedCourseId}
                        onChange={(e) => setSelectedCourseId(e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">None</option>
                        {courses.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {folders.length > 0 && (
                    <div className="space-y-2">
                      <label htmlFor="qc-parsed-folder" className="section-label">Folder</label>
                      <select
                        id="qc-parsed-folder"
                        value={selectedFolderId}
                        onChange={(e) => setSelectedFolderId(e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">None</option>
                        {folders.map((f) => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </details>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleReset}
                className="h-10 sm:h-9 px-4 rounded-md border border-input text-sm hover:bg-muted transition-colors min-h-[44px] sm:min-h-0"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={loading}
                className="h-10 sm:h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 min-h-[44px] sm:min-h-0"
              >
                {loading ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        )}

        {/* File mode */}
        {mode === "file" && (
          <div className="space-y-4 mt-4">
            {/* Upload context selector */}
            <div className="space-y-2">
              <label htmlFor="upload-context" className="section-label">
                Upload to
              </label>
              <div className="flex gap-2">
                {[
                  { value: "notes" as ContextType, label: "Notes" },
                  { value: "course" as ContextType, label: "Course" },
                  { value: "semester" as ContextType, label: "Semester" },
                ].map((ctx) => (
                  <button
                    key={ctx.value}
                    type="button"
                    onClick={() => {
                      setUploadContext(ctx.value);
                      setFileSelectedCourseId("");
                      setSelectedSemesterId("");
                    }}
                    className={`px-3 py-2 sm:py-1.5 text-sm rounded-md transition-colors min-h-[44px] sm:min-h-0 ${
                      uploadContext === ctx.value
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {ctx.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Semester selector (for semester context or course filtering) */}
            {(uploadContext === "semester" || uploadContext === "course") && (
              <div className="space-y-2">
                <label htmlFor="semester-select" className="section-label">
                  Semester
                </label>
                <select
                  id="semester-select"
                  value={selectedSemesterId}
                  onChange={(e) => {
                    setSelectedSemesterId(e.target.value);
                    setFileSelectedCourseId("");
                  }}
                  disabled={loadingOptions}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">
                    {loadingOptions ? "Loading..." : "Select semester"}
                  </option>
                  {semesterOptions.map((sem) => (
                    <option key={sem.id} value={sem.id}>
                      {sem.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Course selector (for course context) */}
            {uploadContext === "course" && (
              <div className="space-y-2">
                <label htmlFor="course-select" className="section-label">
                  Course
                </label>
                <select
                  id="course-select"
                  value={fileSelectedCourseId}
                  onChange={(e) => setFileSelectedCourseId(e.target.value)}
                  disabled={!selectedSemesterId || loadingOptions}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">
                    {!selectedSemesterId
                      ? "Select semester first"
                      : loadingOptions
                        ? "Loading..."
                        : "Select course"}
                  </option>
                  {filteredCourses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                      {course.code ? ` (${course.code})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Open upload dialog button */}
            <button
              type="button"
              onClick={() => setUploadDialogOpen(true)}
              disabled={
                loadingOptions ||
                (uploadContext === "course" && !fileSelectedCourseId) ||
                (uploadContext === "semester" && !selectedSemesterId)
              }
              className="w-full h-24 border-2 border-dashed border-border rounded-md flex flex-col items-center justify-center gap-2 hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
            >
              <Paperclip className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {uploadContext === "notes"
                  ? "Click to upload files to Notes"
                  : uploadContext === "course"
                    ? fileSelectedCourseId
                      ? "Click to upload files to this course"
                      : "Select a course first"
                    : selectedSemesterId
                      ? "Click to upload files to this semester"
                      : "Select a semester first"}
              </span>
            </button>
          </div>
        )}
      </DialogContent>

      {/* File Upload Dialog */}
      <FileUploadDialog {...fileUploadProps} />
    </Dialog>
  );
}
