"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AttachmentDropZone } from "@/features/notes/components/AttachmentDropZone";
import {
  AttachmentProgress,
  type AttachmentStatus,
} from "@/features/notes/components/AttachmentProgress";
import { getPresignedUploadUrl } from "@/lib/s3/actions";
import { getContentType, getFileType } from "@/lib/s3/types";
import { createFileAttachment } from "@/features/files/lib/actions";
import { createDocumentNote } from "@/features/notes/lib/actions-documents";
import type { AttachmentType } from "@prisma/client";

export const MAX_UPLOAD_BYTES = 90 * 1024 * 1024; // 90 MB

const SEMESTER_CATEGORIES = [
  { value: "syllabus", label: "Syllabus" },
  { value: "routine", label: "Routine" },
  { value: "calendar", label: "Calendar" },
  { value: "other", label: "Other" },
];

export interface UnifiedUploadDialogProps {
  mode: "file" | "document";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // file mode props
  semesterId?: string;
  courseId?: string;
  noteId?: string;
  semesterName?: string;
  courseName?: string;
  defaultCategory?: string;
  defaultTags?: string[];
  // document mode props
  folderId?: string;
  folderName?: string;
  taskId?: string;
  projectId?: string;
  existingFilenames?: string[];
  onOptimisticAdd?: (item: { id: string; title: string; fileSize: number }) => void;
  onOptimisticRemove?: (id: string) => void;
  onUploadComplete?: () => void;
}

interface UploadItem {
  id: string;
  file: File;
  displayName: string;
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

function deduplicateFilename(name: string, used: Set<string>): string {
  const clean = sanitizeFilename(name) || "file";
  if (!used.has(clean.toLowerCase())) {
    used.add(clean.toLowerCase());
    return clean;
  }
  const dotIdx = clean.lastIndexOf(".");
  const base = dotIdx > 0 ? clean.slice(0, dotIdx) : clean;
  const ext = dotIdx > 0 ? clean.slice(dotIdx) : "";
  let counter = 1;
  while (used.has(`${base}-${counter}${ext}`.toLowerCase())) {
    counter += 1;
  }
  const unique = `${base}-${counter}${ext}`;
  used.add(unique.toLowerCase());
  return unique;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function UnifiedUploadDialog({
  mode,
  open,
  onOpenChange,
  semesterId,
  courseId,
  noteId,
  semesterName,
  courseName,
  defaultCategory = "other",
  defaultTags = [],
  folderId,
  folderName,
  taskId,
  projectId,
  existingFilenames = [],
  onOptimisticAdd,
  onOptimisticRemove,
  onUploadComplete,
}: UnifiedUploadDialogProps) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [category, setCategory] = useState(defaultCategory);
  const [tagsInput, setTagsInput] = useState(defaultTags.join(", "));
  const [isUploading, setIsUploading] = useState(false);
  const xhrMapRef = useRef<Map<string, XMLHttpRequest>>(new Map());
  const usedNamesRef = useRef<Set<string>>(
    new Set(existingFilenames.map((n) => n.toLowerCase()))
  );

  const uploadSingle = useCallback(
    async (item: UploadItem) => {
      const contentType = item.file.type || getContentType(item.displayName);

      onOptimisticAdd?.({
        id: item.id,
        title: item.displayName,
        fileSize: item.file.size,
      });

      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, status: "uploading", progress: 0, error: undefined } : i
        )
      );

      try {
        const prefix =
          mode === "document"
            ? folderId
              ? `documents/${folderId}`
              : "documents"
            : semesterId
              ? `semesters/${semesterId}`
              : courseId
                ? `courses/${courseId}`
                : "attachments";

        const presigned = await getPresignedUploadUrl(
          `${prefix}/${Date.now()}-${item.displayName}`,
          contentType,
          item.file.size
        );

        if (!presigned.ok) {
          throw new Error(presigned.error || "Storage unavailable");
        }

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhrMapRef.current.set(item.id, xhr);
          xhr.open("PUT", presigned.data.url, true);
          xhr.setRequestHeader("Content-Type", contentType);

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && e.total > 0) {
              const pct = Math.round((e.loaded / e.total) * 100);
              setItems((prev) =>
                prev.map((i) => (i.id === item.id ? { ...i, progress: pct } : i))
              );
            }
          };

          xhr.onload = () => {
            xhrMapRef.current.delete(item.id);
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`Upload failed (${xhr.status})`));
            }
          };

          xhr.onerror = () => {
            xhrMapRef.current.delete(item.id);
            reject(new Error("Network error during upload"));
          };

          xhr.onabort = () => {
            xhrMapRef.current.delete(item.id);
            reject(new Error("Upload cancelled"));
          };

          xhr.send(item.file);
        });

        // Create DB record ONLY after S3 upload succeeds (no orphan DB rows on failure)
        if (mode === "file") {
          const parsedTags = tagsInput
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);
          const created = await createFileAttachment({
            fileName: item.displayName,
            fileSize: item.file.size,
            contentType,
            key: presigned.data.key,
            url: presigned.data.url,
            category: semesterId ? category : undefined,
            tags: parsedTags,
            semesterId,
            courseId,
          });
          if (!created.ok) {
            throw new Error(created.error || "Failed to save file metadata");
          }
        } else {
          const detectedType = getFileType(item.displayName) as AttachmentType;
          const created = await createDocumentNote({
            title: item.displayName.replace(/\.[^.]+$/, "") || item.displayName,
            fileName: item.displayName,
            folderId: folderId || undefined,
            taskId: taskId || undefined,
            projectId: projectId || undefined,
            documentType: detectedType,
            s3Key: presigned.data.key,
            s3Url: presigned.data.url,
            fileSize: item.file.size,
            mimeType: contentType,
          });
          if (!created.ok) {
            throw new Error(created.error || "Failed to save document");
          }
        }

        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  status: "success" as const,
                  progress: 100,
                  key: presigned.data.key,
                  url: presigned.data.url,
                }
              : i
          )
        );
        onOptimisticRemove?.(item.id);
        onUploadComplete?.();
      } catch (err) {
        onOptimisticRemove?.(item.id);
        const msg = err instanceof Error ? err.message : "Upload failed";
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id ? { ...i, status: "error", error: msg } : i
          )
        );
        if (msg !== "Upload cancelled") {
          toast.error(`${item.displayName}: ${msg}`);
        }
      }
    },
    [
      mode,
      folderId,
      semesterId,
      courseId,
      noteId,
      taskId,
      projectId,
      category,
      tagsInput,
      onOptimisticAdd,
      onOptimisticRemove,
      onUploadComplete,
    ]
  );

  const handleFilesSelected = useCallback(
    async (files: File[]) => {
      const valid: UploadItem[] = [];
      for (const file of files) {
        if (file.size > MAX_UPLOAD_BYTES) {
          toast.error(`${file.name} exceeds the 90 MB limit (${formatSize(file.size)})`);
          continue;
        }
        const displayName = deduplicateFilename(file.name, usedNamesRef.current);
        valid.push({
          id: generateId(),
          file,
          displayName,
          progress: 0,
          status: "pending",
        });
      }
      if (valid.length === 0) return;

      setItems((prev) => [...prev, ...valid]);
      setIsUploading(true);
      await Promise.all(valid.map((item) => uploadSingle(item)));
      setIsUploading(false);
    },
    [uploadSingle]
  );

  function handleCancel(id: string) {
    const xhr = xhrMapRef.current.get(id);
    if (xhr) {
      xhr.abort();
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
    onOptimisticRemove?.(id);
  }

  function handleRetry(id: string) {
    const target = items.find((i) => i.id === id);
    if (!target) return;
    void uploadSingle(target);
  }

  const contextLabel =
    folderName || courseName || semesterName || (mode === "document" ? "Library" : "Files");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Upload to {contextLabel}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Maximum file size: 90 MB. Accepted: PDF, images, Office docs, text/markdown,
            audio, video.
          </p>

          {mode === "file" && semesterId && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1 text-xs text-muted-foreground">
                <span>Category</span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm min-h-[44px]"
                >
                  {SEMESTER_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                <span>Tags (comma separated)</span>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="syllabus, notes"
                  className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm min-h-[44px]"
                />
              </label>
            </div>
          )}

          <AttachmentDropZone
            onFiles={handleFilesSelected}
            maxFileSize={MAX_UPLOAD_BYTES}
            disabled={isUploading}
          />

          {items.length > 0 && (
            <div className="space-y-2">
              {items.map((item) => (
                <AttachmentProgress
                  key={item.id}
                  file={item.file}
                  progress={item.progress}
                  status={item.status}
                  error={item.error}
                  onCancel={() => handleCancel(item.id)}
                  onRetry={() => handleRetry(item.id)}
                />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
