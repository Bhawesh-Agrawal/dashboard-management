"use client";

import { useState, useTransition, useRef } from "react";
import { createTask } from "@/features/tasks/lib/actions";
import { createNote } from "@/features/notes/lib/actions";
import { parseQuickCaptureAction } from "@/features/notes/lib/actions-nlp";
import { processOcrAction } from "@/features/notes/lib/actions-ocr";
import type { ParsedCapture } from "@/features/notes/lib/nlp-parsing";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Sparkles, FileText, CheckSquare, Camera, AlertCircle } from "lucide-react";

type CaptureMode = "text" | "photo";

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
  
  // OCR state
  const [mode, setMode] = useState<CaptureMode>("text");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<{
    text: string;
    confidence?: number;
    confidenceDescription?: string;
  } | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [sourceLink, setSourceLink] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleParse() {
    if (!rawInput.trim()) return;

    startParsingTransition(async () => {
      const result = await parseQuickCaptureAction(rawInput);
      setParsed(result);
    });
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
        setOcrResult({
          text: result.text,
          confidence: result.confidence,
          confidenceDescription: result.confidenceDescription,
        });
      } else {
        setOcrError(result.error || "Failed to process image");
      }
    } catch (error) {
      setOcrError(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setLoading(false);
    }
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
      } else if (mode === "photo" && ocrResult) {
        await createNote({
          content: ocrResult.text,
          sourceType: "ocr_photo",
          sourceLink: sourceLink || undefined,
          tags: ["ocr"],
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
    setSelectedFile(null);
    setPreviewUrl(null);
    setOcrResult(null);
    setOcrError(null);
    setSourceLink("");
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

  function handleReset() {
    setParsed(null);
    setRawInput("");
    setOcrResult(null);
    setOcrError(null);
  }

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
          <button className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors" />
        }
      >
        <Plus className="h-4 w-4" />
        Quick Capture
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Quick Capture</DialogTitle>
        </DialogHeader>

        {/* Mode tabs */}
        <div className="flex gap-1 p-1 bg-muted rounded-md mt-4">
          <button
            onClick={() => setMode("text")}
            className={`flex-1 px-3 py-1.5 text-sm rounded transition-colors ${
              mode === "text"
                ? "bg-background text-foreground font-medium shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles className="h-4 w-4 inline mr-1" />
            Text (AI)
          </button>
          <button
            onClick={() => setMode("photo")}
            className={`flex-1 px-3 py-1.5 text-sm rounded transition-colors ${
              mode === "photo"
                ? "bg-background text-foreground font-medium shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Camera className="h-4 w-4 inline mr-1" />
            Photo (OCR)
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
                className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                {parsing ? "Parsing..." : "Parse"}
              </button>
            </div>
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

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleReset}
                className="h-9 px-4 rounded-md border border-input text-sm hover:bg-muted transition-colors"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={loading}
                className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
              >
                {loading ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        )}

        {/* Photo mode */}
        {mode === "photo" && !ocrResult && (
          <div className="space-y-4 mt-4">
            <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
              <AlertCircle className="h-3 w-3 inline mr-1" />
              Transcription may need cleanup, especially for handwriting.
            </div>
            
            <div className="space-y-2">
              <label htmlFor="photo-input" className="section-label">
                Select Photo
              </label>
              <input
                ref={fileInputRef}
                id="photo-input"
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-32 border-2 border-dashed border-border rounded-md flex flex-col items-center justify-center gap-2 hover:bg-muted/50 transition-colors"
              >
                <Camera className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {selectedFile ? selectedFile.name : "Click to select photo"}
                </span>
              </button>
            </div>

            {previewUrl && (
              <div className="space-y-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="max-h-40 rounded-md border border-border"
                />
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="source-link" className="section-label">
                Source Link (optional)
              </label>
              <input
                id="source-link"
                type="url"
                value={sourceLink}
                onChange={(e) => setSourceLink(e.target.value)}
                placeholder="OneDrive share link to original photo"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            {ocrError && (
              <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
                {ocrError}
              </div>
            )}

            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {selectedFile ? "Ready to process" : "Select a photo to begin"}
              </p>
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
          </div>
        )}

        {/* Photo mode - OCR result */}
        {mode === "photo" && ocrResult && (
          <div className="space-y-4 mt-4">
            <div className="rounded-md border border-input bg-muted/50 p-3">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium">OCR Result</span>
                {ocrResult.confidenceDescription && (
                  <span className="text-xs bg-muted rounded px-1.5 py-0.5">
                    {ocrResult.confidenceDescription}
                  </span>
                )}
              </div>

              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {ocrResult.text}
              </p>

              {sourceLink && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Source: <a href={sourceLink} target="_blank" rel="noopener noreferrer" className="underline">{sourceLink}</a>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleReset}
                className="h-9 px-4 rounded-md border border-input text-sm hover:bg-muted transition-colors"
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={loading}
                className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
              >
                {loading ? "Saving..." : "Save as Note"}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
