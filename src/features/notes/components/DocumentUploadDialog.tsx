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
import { AttachmentDropZone } from "./AttachmentDropZone";
import { AttachmentProgress } from "./AttachmentProgress";
import type { AttachmentStatus } from "./AttachmentProgress";
import { getPresignedUploadUrl } from "@/lib/s3/actions";
import { getContentType, getFileType } from "@/lib/s3/types";
import { createDocumentNote } from "@/features/notes/lib/actions-documents";
import type { AttachmentType } from "@prisma/client";

const DOCUMENT_TYPES = [
  { value: "PDF", label: "PDF" },
  { value: "IMAGE", label: "Image" },
  { value: "VIDEO", label: "Video" },
  { value: "AUDIO", label: "Audio" },
  { value: "DOCUMENT", label: "Document" },
  { value: "TEXT", label: "Text" },
] as const;

export interface DocumentUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderId?: string;
  folderName?: string;
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

export function DocumentUploadDialog({
  open,
  onOpenChange,
  folderId,
  folderName,
  onUploadComplete,
}: DocumentUploadDialogProps) {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [documentType, setDocumentType] = useState<string>("PDF");

  const folderPath = folderId ? `documents/${folderId}` : "documents";

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

    // Auto-set title from first file name
    if (files.length === 1 && !title) {
      setTitle(files[0].name.replace(/\.[^.]+$/, ""));
    }

    // Auto-detect type from first file
    if (files.length === 1) {
      const contentType = files[0].type || getContentType(files[0].name);
      const fileType = getFileType(contentType);
      setDocumentType(fileType);
    }
  }, [title]);

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
    if (uploads.length === 0 || !title.trim()) return;

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

      const result = await getPresignedUploadUrl(key, contentType);
      if (!result.ok) {
        updateUpload(item.id, { status: "error", error: result.error });
        continue;
      }

      try {
        await uploadToS3(result.data.url, file, (loaded, total) => {
          updateUpload(item.id, { progress: (loaded / total) * 100 });
        });

        const saveResult = await createDocumentNote({
          title: title.trim(),
          folderId: folderId || null,
          documentType: documentType as AttachmentType,
          s3Key: result.data.key,
          s3Url: result.data.url,
          fileSize: file.size,
          fileName: file.name,
          mimeType: contentType,
          tags: [],
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
        `${successCount} document${successCount > 1 ? "s" : ""} uploaded`
      );
      onUploadComplete?.();
    }

    setUploading(false);

    const allDone = uploads.every(
      (u) => u.status === "success" || u.status === "error"
    );
    if (allDone) {
      setTimeout(() => {
        onOpenChange(false);
        setUploads([]);
        setTitle("");
        setDocumentType("PDF");
      }, 500);
    }
  }, [uploads, folderPath, title, documentType, folderId, updateUpload, onUploadComplete, onOpenChange]);

  function handleClose() {
    if (uploading) return;
    setUploads([]);
    setTitle("");
    setDocumentType("PDF");
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
            <Upload className="h-5 w-5" />
            Upload Document
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Folder context */}
          {folderName && (
            <div className="text-sm text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-md">
              Saving to: {folderName}
            </div>
          )}

          {/* Title */}
          <div className="space-y-1.5">
            <label htmlFor="doc-title" className="section-label">
              Title
            </label>
            <input
              id="doc-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Document title"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          {/* Document type */}
          <div className="space-y-1.5">
            <label className="section-label">Type</label>
            <div className="flex gap-2 flex-wrap">
              {DOCUMENT_TYPES.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setDocumentType(type.value)}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    documentType === type.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
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
              disabled={uploads.length === 0 || uploading || pendingCount === 0 || !title.trim()}
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
