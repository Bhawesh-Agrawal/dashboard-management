"use client";

import { useState, useCallback } from "react";
import { DropZone } from "./DropZone";
import { UploadProgress } from "./UploadProgress";
import type { UploadStatus } from "./UploadProgress";
import { getPresignedUploadUrl } from "@/lib/s3/actions";
import { getContentType } from "@/lib/s3/types";

export interface UploadedFile {
  key: string;
  url: string;
  size: number;
  contentType: string;
  name: string;
}

export interface FileUploaderProps {
  onUploadComplete: (files: UploadedFile[]) => void;
  onUploadError?: (error: string) => void;
  acceptedTypes?: string[];
  maxFileSize?: number;
  maxFiles?: number;
  folderPath?: string;
}

interface UploadItem {
  id: string;
  file: File;
  progress: number;
  status: UploadStatus;
  speed: number;
  error?: string;
  key?: string;
  url?: string;
  xhr?: XMLHttpRequest;
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

export function FileUploader({
  onUploadComplete,
  onUploadError,
  acceptedTypes,
  maxFileSize,
  maxFiles,
  folderPath = "uploads",
}: FileUploaderProps) {
  const [uploads, setUploads] = useState<UploadItem[]>([]);

  const updateUpload = useCallback((id: string, updates: Partial<UploadItem>) => {
    setUploads((prev) =>
      prev.map((u) => (u.id === id ? { ...u, ...updates } : u))
    );
  }, []);

  const startUpload = useCallback(
    async (item: UploadItem) => {
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
        onUploadError?.(result.error);
        return;
      }

      const { url } = result.data;

      // Step 2: Upload via XHR with progress
      let lastLoaded = 0;
      let lastTime = Date.now();

      try {
        await uploadToS3(url, file, (loaded, total) => {
          const now = Date.now();
          const dt = (now - lastTime) / 1000;
          const dl = loaded - lastLoaded;

          if (dt > 0) {
            const speed = dl / dt;
            updateUpload(item.id, {
              progress: (loaded / total) * 100,
              speed,
            });
          }

          lastLoaded = loaded;
          lastTime = now;
        });

        // Success
        updateUpload(item.id, {
          status: "success",
          progress: 100,
          key: result.data.key,
          url,
        });

        onUploadComplete([
          {
            key: result.data.key,
            url,
            size: file.size,
            contentType,
            name: file.name,
          },
        ]);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Upload failed";
        if (message === "Upload cancelled") return;

        updateUpload(item.id, {
          status: "error",
          error: message,
        });
        onUploadError?.(message);
      }
    },
    [folderPath, updateUpload, onUploadComplete, onUploadError]
  );

  const handleFiles = useCallback(
    (files: File[]) => {
      const newItems: UploadItem[] = files.map((file) => ({
        id: generateId(),
        file,
        progress: 0,
        status: "pending" as const,
        speed: 0,
      }));

      setUploads((prev) => [...prev, ...newItems]);

      // Start uploads
      for (const item of newItems) {
        updateUpload(item.id, { status: "uploading" });
        startUpload(item);
      }
    },
    [updateUpload, startUpload]
  );

  const handleCancel = useCallback(
    (id: string) => {
      setUploads((prev) => {
        const item = prev.find((u) => u.id === id);
        if (item?.xhr) {
          item.xhr.abort();
        }
        return prev.filter((u) => u.id !== id);
      });
    },
    []
  );

  const handleRetry = useCallback(
    (id: string) => {
      updateUpload(id, {
        status: "uploading",
        progress: 0,
        speed: 0,
        error: undefined,
      });

      setUploads((prev) => {
        const item = prev.find((u) => u.id === id);
        if (item) {
          startUpload({ ...item, status: "uploading", progress: 0, speed: 0, error: undefined });
        }
        return prev;
      });
    },
    [updateUpload, startUpload]
  );

  const activeCount = uploads.filter(
    (u) => u.status === "uploading" || u.status === "pending"
  ).length;

  return (
    <div className="space-y-4">
      <DropZone
        onFiles={handleFiles}
        acceptedTypes={acceptedTypes}
        maxFileSize={maxFileSize}
        maxFiles={maxFiles ? maxFiles - uploads.length : undefined}
        disabled={maxFiles ? uploads.length >= maxFiles : false}
      />

      {uploads.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">
              Files ({uploads.length})
            </h3>
            {activeCount > 0 && (
              <span className="text-xs text-muted-foreground">
                {activeCount} uploading
              </span>
            )}
          </div>

          <div className="space-y-2">
            {uploads.map((item) => (
              <UploadProgress
                key={item.id}
                file={item.file}
                progress={item.progress}
                status={item.status}
                speed={item.speed}
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
        </div>
      )}
    </div>
  );
}
