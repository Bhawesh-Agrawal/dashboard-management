"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  FileText,
  Image as ImageIcon,
  Video,
  Music,
  File,
  Trash2,
  ExternalLink,
  Download,
} from "lucide-react";
import { deleteFileAttachment } from "../lib/actions";
import type { FileAttachment } from "../lib/actions";

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getFileIcon(contentType: string) {
  if (contentType.startsWith("image/")) return <ImageIcon className="h-4 w-4 text-[var(--chart-2)]" />;
  if (contentType.startsWith("video/")) return <Video className="h-4 w-4 text-[var(--chart-1)]" />;
  if (contentType.startsWith("audio/")) return <Music className="h-4 w-4 text-[var(--chart-4)]" />;
  if (contentType === "application/pdf") return <FileText className="h-4 w-4 text-destructive" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

interface FileListProps {
  files: FileAttachment[];
  onDelete?: (id: string) => void;
  showTags?: boolean;
  showCategory?: boolean;
}

export function FileList({
  files,
  onDelete,
  showTags = false,
  showCategory = false,
}: FileListProps) {
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm("Delete this file?")) return;

    setDeleting(id);
    const result = await deleteFileAttachment(id);
    setDeleting(null);

    if (result.ok) {
      toast.success("File deleted");
      onDelete?.(id);
    } else {
      toast.error(result.error);
    }
  }

  if (files.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No files yet
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {files.map((file) => (
        <div
          key={file.id}
          className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted/50 group"
        >
          {getFileIcon(file.contentType)}

          <div className="flex-1 min-w-0">
            <p className="text-sm truncate">{file.fileName}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{formatSize(file.fileSize)}</span>
              <span>·</span>
              <span>{formatDate(file.uploadedAt)}</span>
              {showCategory && file.category && (
                <>
                  <span>·</span>
                  <span className="capitalize">{file.category}</span>
                </>
              )}
            </div>
          </div>

          {showTags && file.tags.length > 0 && (
            <div className="flex gap-1 shrink-0">
              {file.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="text-[0.6rem] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
              {file.tags.length > 3 && (
                <span className="text-[0.6rem] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                  +{file.tags.length - 3}
                </span>
              )}
            </div>
          )}

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <a
              href={file.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
              title="Open"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <a
              href={file.url}
              download={file.fileName}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
              title="Download"
            >
              <Download className="h-3.5 w-3.5" />
            </a>
            <button
              type="button"
              onClick={() => handleDelete(file.id)}
              disabled={deleting === file.id}
              className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive disabled:opacity-50"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
