"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Paperclip } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AttachmentDropZone } from "./AttachmentDropZone";
import { AttachmentProgress } from "./AttachmentProgress";
import type { AttachmentStatus } from "./AttachmentProgress";
import { getPresignedUploadUrl } from "@/lib/s3/actions";
import { addNoteAttachment } from "@/features/notes/lib/actions-attachments";
import { getContentType, getFileType } from "@/lib/s3/types";
import type { AttachmentType } from "@prisma/client";

export interface UploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteId?: string;
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

export function UploadDialog({
  open,
  onOpenChange,
  noteId,
  onUploadComplete,
}: UploadDialogProps) {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [folderPath, setFolderPath] = useState(
    noteId ? `notes/${noteId}` : "notes"
  );

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
      const key = `${folderPath}/${timestamp}-${safeName}`;
      const contentType = file.type || getContentType(file.name);

      // Step 1: Get presigned URL
      const result = await getPresignedUploadUrl(key, contentType);
      if (!result.ok) {
        updateUpload(item.id, {
          status: "error",
          error: result.error,
        });
        continue;
      }

      // Step 2: Upload via XHR
      try {
        await uploadToS3(result.data.url, file, (loaded, total) => {
          updateUpload(item.id, {
            progress: (loaded / total) * 100,
          });
        });

        // Step 3: Save to database via NoteAttachment
        if (noteId) {
          const fileType = getFileType(contentType);
          const attachmentType = fileType === "PDF" ? "PDF"
            : fileType === "IMAGE" ? "IMAGE"
            : fileType === "VIDEO" ? "VIDEO"
            : fileType === "AUDIO" ? "AUDIO"
            : fileType === "DOCUMENT" ? "DOCUMENT"
            : fileType === "TEXT" ? "TEXT"
            : "OTHER";

          const saveResult = await addNoteAttachment(noteId, {
            type: attachmentType as AttachmentType,
            title: file.name,
            s3Key: result.data.key,
            s3Url: result.data.url,
            fileSize: file.size,
            fileName: file.name,
            mimeType: contentType,
          });

          if (!saveResult.ok) {
            updateUpload(item.id, {
              status: "error",
              error: saveResult.error,
            });
            continue;
          }
        }

        successCount++;
        updateUpload(item.id, { status: "success", progress: 100 });
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

    // Close dialog after short delay if all uploads succeeded
    const allDone = uploads.every(
      (u) => u.status === "success" || u.status === "error"
    );
    if (allDone) {
      setTimeout(() => {
        onOpenChange(false);
        setUploads([]);
      }, 500);
    }
  }, [
    uploads,
    folderPath,
    noteId,
    updateUpload,
    onUploadComplete,
    onOpenChange,
  ]);

  function handleClose() {
    if (uploading) return;
    setUploads([]);
    onOpenChange(false);
  }

  const pendingCount = uploads.filter(
    (u) => u.status === "pending" || u.status === "uploading"
  ).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            <Paperclip className="h-5 w-5" />
            Attach File
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Drop zone */}
          <AttachmentDropZone
            onFiles={handleFiles}
            maxFiles={10 - uploads.length}
            disabled={uploads.length >= 10}
          />

          {/* Folder path */}
          <div className="space-y-1.5">
            <label htmlFor="folder-path" className="section-label">
              Save to
            </label>
            <input
              id="folder-path"
              type="text"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              placeholder="notes/my-note"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            />
          </div>

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
