"use client";

import { Loader2, CheckCircle2, XCircle, X } from "lucide-react";

export type UploadStatus = "pending" | "uploading" | "success" | "error";

export interface UploadProgressProps {
  file: File;
  progress: number;
  status: UploadStatus;
  speed?: number;
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

function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond === 0) return "—";
  const mbps = bytesPerSecond / (1024 * 1024);
  if (mbps >= 1) return `${mbps.toFixed(1)} MB/s`;
  const kbps = bytesPerSecond / 1024;
  return `${kbps.toFixed(0)} KB/s`;
}

function formatETA(seconds: number): string {
  if (seconds < 1) return "—";
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60);
  return `${minutes}m ${secs}s`;
}

export function UploadProgress({
  file,
  progress,
  status,
  speed = 0,
  error,
  onCancel,
  onRetry,
}: UploadProgressProps) {
  const eta = speed > 0 ? (file.size * (1 - progress / 100)) / speed : 0;

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card">
      {/* Status icon */}
      <div className="shrink-0 mt-0.5">
        {status === "uploading" && (
          <Loader2 className="h-4 w-4 text-[var(--chart-1)] animate-spin" />
        )}
        {status === "success" && (
          <CheckCircle2 className="h-4 w-4 text-[var(--chart-2)]" />
        )}
        {status === "error" && (
          <XCircle className="h-4 w-4 text-destructive" />
        )}
        {status === "pending" && (
          <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
        )}
      </div>

      {/* File info + progress */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium truncate">{file.name}</p>
          <span className="text-xs text-muted-foreground shrink-0">
            {formatFileSize(file.size)}
          </span>
        </div>

        {/* Progress bar */}
        {status === "uploading" && (
          <div className="space-y-1">
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--chart-1)] transition-all duration-300"
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{Math.round(progress)}%</span>
              <span>
                {formatSpeed(speed)}
                {speed > 0 && ` · ${formatETA(eta)}`}
              </span>
            </div>
          </div>
        )}

        {/* Success message */}
        {status === "success" && (
          <p className="text-xs text-[var(--chart-2)]">Upload complete</p>
        )}

        {/* Error message */}
        {status === "error" && (
          <div className="space-y-1.5">
            <p className="text-xs text-destructive">
              {error || "Upload failed"}
            </p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="text-xs font-medium text-destructive hover:underline"
              >
                Retry
              </button>
            )}
          </div>
        )}
      </div>

      {/* Cancel button */}
      {(status === "uploading" || status === "pending") && (
        <button
          type="button"
          onClick={onCancel}
          className="shrink-0 p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Cancel upload"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
