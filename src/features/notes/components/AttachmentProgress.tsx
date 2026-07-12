"use client";

import { Loader2, CheckCircle2, XCircle, X } from "lucide-react";

export type AttachmentStatus = "pending" | "uploading" | "success" | "error";

export interface AttachmentProgressProps {
  file: File;
  progress: number;
  status: AttachmentStatus;
  error?: string;
  onCancel: () => void;
  onRetry?: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function AttachmentProgress({
  file,
  progress,
  status,
  error,
  onCancel,
  onRetry,
}: AttachmentProgressProps) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      {/* Status icon */}
      <div className="shrink-0">
        {status === "uploading" && (
          <Loader2 className="h-3.5 w-3.5 text-[var(--chart-1)] animate-spin" />
        )}
        {status === "success" && (
          <CheckCircle2 className="h-3.5 w-3.5 text-[var(--chart-2)]" />
        )}
        {status === "error" && (
          <XCircle className="h-3.5 w-3.5 text-destructive" />
        )}
        {status === "pending" && (
          <div className="h-3.5 w-3.5 rounded-full border-2 border-muted-foreground/30" />
        )}
      </div>

      {/* File info + progress */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm truncate">{file.name}</p>
          <span className="text-xs text-muted-foreground shrink-0">
            {formatFileSize(file.size)}
          </span>
        </div>

        {/* Progress bar */}
        {status === "uploading" && (
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--chart-1)] transition-all duration-300"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        )}

        {/* Error message */}
        {status === "error" && (
          <div className="flex items-center gap-2">
            <p className="text-xs text-destructive truncate">
              {error || "Upload failed"}
            </p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="text-xs font-medium text-destructive hover:underline shrink-0"
              >
                Retry
              </button>
            )}
          </div>
        )}

        {/* Success message */}
        {status === "success" && (
          <p className="text-xs text-[var(--chart-2)]">Done</p>
        )}
      </div>

      {/* Cancel button */}
      {(status === "uploading" || status === "pending") && (
        <button
          type="button"
          onClick={onCancel}
          className="shrink-0 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Cancel upload"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
