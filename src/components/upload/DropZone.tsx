"use client";

import { useState, useRef, useCallback } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ALLOWED_EXTENSIONS,
  FILE_SIZE_LIMITS,
  getFileType,
  getContentType,
  getExtension,
} from "@/lib/s3/types";

export interface DropZoneProps {
  onFiles: (files: File[]) => void;
  acceptedTypes?: string[];
  maxFileSize?: number;
  maxFiles?: number;
  disabled?: boolean;
  error?: string;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function validateFile(
  file: File,
  acceptedTypes?: string[],
  maxFileSize?: number
): string | null {
  const ext = getExtension(file.name);

  if (BLOCKED_EXTENSIONS.has(ext)) {
    return "File type not allowed";
  }

  if (acceptedTypes && acceptedTypes.length > 0) {
    const normalized = acceptedTypes.map((t) =>
      t.startsWith(".") ? t.slice(1).toLowerCase() : t.toLowerCase()
    );
    if (!normalized.includes(ext)) {
      return `File type .${ext} is not allowed`;
    }
  } else if (!ALLOWED_EXTENSIONS.has(ext)) {
    return "File type not allowed";
  }

  if (maxFileSize && file.size > maxFileSize) {
    return `File exceeds maximum size of ${formatSize(maxFileSize)}`;
  }

  const contentType = getContentType(file.name);
  const fileType = getFileType(contentType);
  const defaultMax = FILE_SIZE_LIMITS[fileType];
  if (file.size > defaultMax) {
    return `File exceeds maximum size of ${formatSize(defaultMax)}`;
  }

  return null;
}

const BLOCKED_EXTENSIONS = new Set([
  "exe",
  "js",
  "mjs",
  "cjs",
  "html",
  "htm",
  "svg",
  "bat",
  "cmd",
  "sh",
  "ps1",
  "vbs",
  "vbe",
  "wsf",
  "wsh",
  "msi",
  "dll",
  "com",
  "scr",
  "pif",
  "hta",
  "cpl",
  "jar",
  "ws",
]);

export function DropZone({
  onFiles,
  acceptedTypes,
  maxFileSize,
  maxFiles,
  disabled = false,
  error,
}: DropZoneProps) {
  const [dragActive, setDragActive] = useState(false);
  const [dragError, setDragError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFiles = useCallback(
    (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      const validFiles: File[] = [];
      const errors: string[] = [];

      for (const file of files) {
        if (maxFiles && validFiles.length >= maxFiles) {
          errors.push(`Maximum ${maxFiles} files allowed`);
          break;
        }

        const err = validateFile(file, acceptedTypes, maxFileSize);
        if (err) {
          errors.push(`${file.name}: ${err}`);
        } else {
          validFiles.push(file);
        }
      }

      if (errors.length > 0) {
        setDragError(errors[0]);
        setTimeout(() => setDragError(null), 4000);
      }

      if (validFiles.length > 0) {
        onFiles(validFiles);
      }
    },
    [onFiles, acceptedTypes, maxFileSize, maxFiles]
  );

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (disabled) return;

    if (e.dataTransfer.files?.length) {
      processFiles(e.dataTransfer.files);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setDragActive(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }

  function handleClick() {
    if (!disabled) inputRef.current?.click();
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) {
      processFiles(e.target.files);
    }
    e.target.value = "";
  }

  const displayError = error || dragError;

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={acceptedTypes?.join(",")}
        onChange={handleChange}
        className="hidden"
      />

      <button
        type="button"
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        disabled={disabled}
        className={cn(
          "relative flex flex-col items-center justify-center gap-3",
          "w-full min-h-[140px] p-6",
          "rounded-lg border-2 border-dashed",
          "transition-all duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          dragActive && !disabled
            ? "border-[var(--primary)] bg-[var(--primary)]/5 scale-[0.98]"
            : "border-[#E5E2DD] hover:border-muted-foreground/50 hover:bg-muted/30",
          displayError && "border-destructive bg-destructive/5"
        )}
      >
        <Upload
          className={cn(
            "h-8 w-8 transition-colors",
            dragActive ? "text-[var(--primary)]" : "text-muted-foreground",
            displayError && "text-destructive"
          )}
        />

        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            {dragActive ? (
              <span className="text-[var(--primary)] font-medium">
                Drop files here
              </span>
            ) : (
              <>
                Drag & drop files or{" "}
                <span className="text-[var(--primary)] font-medium">
                  click to browse
                </span>
              </>
            )}
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            {acceptedTypes
              ? acceptedTypes.join(", ")
              : "PDF, images, video, audio, documents"}
          </p>
        </div>
      </button>

      {displayError && (
        <p className="text-xs text-destructive">{displayError}</p>
      )}
    </div>
  );
}
