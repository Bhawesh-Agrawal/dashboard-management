"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AttachmentDropZone } from "@/features/notes/components/AttachmentDropZone";
import { AttachmentProgress } from "@/features/notes/components/AttachmentProgress";
import type { AttachmentStatus } from "@/features/notes/components/AttachmentProgress";
import { getPresignedUploadUrl } from "@/lib/s3/actions";
import { getContentType } from "@/lib/s3/types";
import { createFileAttachment } from "../lib/actions";

const SEMESTER_CATEGORIES = [
  { value: "syllabus", label: "Syllabus" },
  { value: "routine", label: "Routine" },
  { value: "calendar", label: "Calendar" },
  { value: "other", label: "Other" },
];

export interface FileUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  semesterId?: string;
  courseId?: string;
  noteId?: string;
  semesterName?: string;
  courseName?: string;
  defaultCategory?: string;
  defaultTags?: string[];
  onUploadComplete?: () => void;
}

interface UploadItem {
  id: string;
  file: File;
  progress: number;
  status: AttachmentStatus;
  error?: string;
  key?: string;
  url?: string;
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 200);
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function uploadToS3(
  presignedUrl: string,
  file: File,
  onProgress: (loaded: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", presignedUrl, true);
    xhr.setRequestHeader("Content-Type", file.type || getContentType(file.name));

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(e.loaded, e.total);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error("Network error"));
    xhr.onabort = () => reject(new Error("Upload cancelled"));

    xhr.send(file);
  });
}

export function FileUploadDialog({
  open,
  onOpenChange,
  semesterId,
  courseId,
  noteId,
  semesterName,
  courseName,
  defaultCategory,
  defaultTags = [],
  onUploadComplete,
}: FileUploadDialogProps) {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState(defaultCategory || "other");
  const [tagsInput, setTagsInput] = useState(defaultTags.join(", "));
  const [description, setDescription] = useState("");

  const isSemesterLevel = !!semesterId && !courseId;
  const isCourseLevel = !!courseId;

  // Build folder path based on context
  const folderPath = courseId
    ? `courses/${courseId}`
    : semesterId
      ? `semesters/${semesterId}`
      : "uploads";

  const updateUpload = useCallback((id: string, updates: Partial<UploadItem>) => {
    setUploads((prev) =>
      prev.map((u) => (u.id === id ? { ...u, ...updates } : u))
    );
  }, []);

  const handleFiles = useCallback((files: File[]) => {
    const newItems: UploadItem[] = files.map((file) => ({
      id: generateId(),
      file,
      progress: 0,
      status: "pending" as const,
    }));

    setUploads((prev) => [...prev, ...newItems]);
  }, []);

  const handleCancel = useCallback((id: string) => {
    setUploads((prev) => prev.filter((u) => u.id !== id));
  }, []);

  const handleRetry = useCallback(
    (id: string) => {
      updateUpload(id, {
        status: "uploading",
        progress: 0,
        error: undefined,
      });
    },
    [updateUpload]
  );

  const handleUpload = useCallback(async () => {
    if (uploads.length === 0) return;

    setUploading(true);
    let successCount = 0;

    for (const item of uploads) {
      if (item.status === "success") continue;

      updateUpload(item.id, { status: "uploading", progress: 0 });

      const { file } = item;
      const timestamp = Date.now();
      const safeName = sanitizeFilename(file.name);

      // Add category subfolder for semester-level files
      const categoryPath = isSemesterLevel ? `/${category}` : "";
      const key = `${folderPath}${categoryPath}/${timestamp}-${safeName}`;
      const contentType = file.type || getContentType(file.name);

      // Get presigned URL
      const result = await getPresignedUploadUrl(key, contentType);
      if (!result.ok) {
        updateUpload(item.id, { status: "error", error: result.error });
        continue;
      }

      // Upload via XHR
      try {
        await uploadToS3(result.data.url, file, (loaded, total) => {
          updateUpload(item.id, { progress: (loaded / total) * 100 });
        });

        // Save to database
        const tags = tagsInput
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);

        const saveResult = await createFileAttachment({
          fileName: file.name,
          fileSize: file.size,
          contentType,
          key: result.data.key,
          url: result.data.url,
          semesterId,
          courseId,
          category: isSemesterLevel ? category : undefined,
          tags: isCourseLevel ? tags : undefined,
          description: description || undefined,
        });

        if (saveResult.ok) {
          updateUpload(item.id, { status: "success", progress: 100 });
          successCount++;
        } else {
          updateUpload(item.id, { status: "error", error: saveResult.error });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        if (message === "Upload cancelled") continue;
        updateUpload(item.id, { status: "error", error: message });
      }
    }

    if (successCount > 0) {
      toast.success(
        `${successCount} file${successCount > 1 ? "s" : ""} uploaded`
      );
      onUploadComplete?.();
    }

    setUploading(false);

    // Close dialog after delay
    const allDone = uploads.every(
      (u) => u.status === "success" || u.status === "error"
    );
    if (allDone) {
      setTimeout(() => {
        onOpenChange(false);
        setUploads([]);
        setCategory(defaultCategory || "other");
        setTagsInput(defaultTags.join(", "));
        setDescription("");
      }, 500);
    }
  }, [
    uploads,
    folderPath,
    isSemesterLevel,
    isCourseLevel,
    category,
    tagsInput,
    description,
    semesterId,
    courseId,
    noteId,
    updateUpload,
    onUploadComplete,
    onOpenChange,
    defaultCategory,
    defaultTags,
  ]);

  function resetState() {
    setUploads([]);
    setCategory(defaultCategory || "other");
    setTagsInput(defaultTags.join(", "));
    setDescription("");
  }

  function handleClose() {
    if (uploading) return;
    resetState();
    onOpenChange(false);
  }

  const contextLabel = courseName
    ? `Course: ${courseName}`
    : semesterName
      ? `Semester: ${semesterName}`
      : null;

  const pendingCount = uploads.filter(
    (u) => u.status === "pending" || u.status === "uploading"
  ).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload File
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Context display */}
          {contextLabel && (
            <div className="text-sm text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-md">
              {contextLabel}
            </div>
          )}

          {/* Category selector (semester-level only) */}
          {isSemesterLevel && (
            <div className="space-y-1.5">
              <label htmlFor="category" className="section-label">
                Category
              </label>
              <div className="flex gap-2">
                {SEMESTER_CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setCategory(cat.value)}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                      category === cat.value
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tags input (course-level only) */}
          {isCourseLevel && (
            <div className="space-y-1.5">
              <label htmlFor="tags" className="section-label">
                Tags (comma-separated)
              </label>
              <input
                id="tags"
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="e.g. lecture, assignment, reference"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              />
            </div>
          )}

          {/* Description */}
          <div className="space-y-1.5">
            <label htmlFor="description" className="section-label">
              Description (optional)
            </label>
            <input
              id="description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the file"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            />
          </div>

          {/* Drop zone */}
          <AttachmentDropZone
            onFiles={handleFiles}
            maxFiles={10 - uploads.length}
            disabled={uploads.length >= 10}
          />

          {/* File list */}
          {uploads.length > 0 && (
            <div className="space-y-1 max-h-[200px] overflow-y-auto">
              {uploads.map((item) => (
                <AttachmentProgress
                  key={item.id}
                  file={item.file}
                  progress={item.progress}
                  status={item.status}
                  error={item.error}
                  onCancel={() => handleCancel(item.id)}
                  onRetry={
                    item.status === "error"
                      ? () => handleRetry(item.id)
                      : undefined
                  }
                />
              ))}
            </div>
          )}

          {/* Total size */}
          {uploads.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {uploads.length} file{uploads.length > 1 ? "s" : ""} ·{" "}
              {formatSize(uploads.reduce((sum, u) => sum + u.file.size, 0))}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={uploading}
              className="inline-flex h-9 items-center justify-center rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleUpload}
              disabled={uploads.length === 0 || uploading || pendingCount === 0}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {uploading
                ? "Uploading..."
                : `Upload ${pendingCount > 0 ? `(${pendingCount})` : ""}`}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
