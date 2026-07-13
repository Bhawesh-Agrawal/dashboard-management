"use client";

import Link from "next/link";
import {
  FileText,
  Image,
  Video,
  Music,
  File,
  Globe,
  Star,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NoteWithDocumentInfo } from "@/types";

function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function getTypeIcon(type: string | null) {
  switch (type) {
    case "PDF":
      return { icon: FileText, color: "text-red-500", bg: "bg-red-50" };
    case "IMAGE":
      return { icon: Image, color: "text-blue-500", bg: "bg-blue-50" };
    case "VIDEO":
      return { icon: Video, color: "text-purple-500", bg: "bg-purple-50" };
    case "AUDIO":
      return { icon: Music, color: "text-amber-500", bg: "bg-amber-50" };
    case "LINK":
      return { icon: Globe, color: "text-green-500", bg: "bg-green-50" };
    case "DOCUMENT":
    case "TEXT":
      return { icon: FileText, color: "text-sky-500", bg: "bg-sky-50" };
    default:
      return { icon: File, color: "text-muted-foreground", bg: "bg-muted" };
  }
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export interface DocumentCardProps {
  note: NoteWithDocumentInfo & { _source?: string };
  viewMode: "grid" | "list";
  onFavorite?: (id: string) => void;
  onDelete?: (id: string) => void;
  onPdfView?: (note: NoteWithDocumentInfo) => void;
}

export function DocumentCard({
  note,
  viewMode,
  onFavorite,
  onDelete,
  onPdfView,
}: DocumentCardProps) {
  const { icon: TypeIcon, color, bg } = getTypeIcon(note.documentType);
  const title = note.title || note.fileName || "Untitled";
  const isLink = note.documentType === "LINK";
  const isFileAttachment = (note as { _source?: string })._source === "file_attachment";

  if (viewMode === "list") {
    return (
      <div className="list-row items-center group">
        {/* Type icon */}
        <div className={cn("h-8 w-8 rounded flex items-center justify-center shrink-0", bg)}>
          <TypeIcon className={cn("h-4 w-4", color)} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 ml-3">
          <Link href={`/notes/${note.id}`} className="block">
            <p className="text-sm font-medium truncate hover:underline">{title}</p>
          </Link>
          <div className="flex items-center gap-2 mt-0.5">
            {note.folder && (
              <span className="text-xs text-muted-foreground">{note.folder.name}</span>
            )}
            {isFileAttachment && (
              <span className="text-[0.6rem] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
                Semester
              </span>
            )}
            {note.fileSize ? (
              <span className="text-xs text-muted-foreground">{formatFileSize(note.fileSize)}</span>
            ) : null}
            <span className="text-xs text-muted-foreground">{formatDate(note.createdAt)}</span>
          </div>
        </div>

        {/* Actions (hover) */}
        <div className="flex items-center gap-1 touch-edit shrink-0">
          {isLink && note.s3Url ? (
            <a
              href={note.s3Url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 sm:p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
              title="Open link"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : note.documentType === "PDF" && onPdfView && note.s3Url ? (
            <button
              type="button"
              onClick={() => onPdfView(note)}
              className="p-2 sm:p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
              title="View PDF"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          ) : (
            <Link
              href={`/notes/${note.id}`}
              className="p-2 sm:p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
              title="View"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          )}
          <button
            type="button"
            onClick={() => onFavorite?.(note.id)}
            className="p-2 sm:p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
            title={note.isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            <Star
              className={cn(
                "h-3.5 w-3.5",
                note.isFavorite && "fill-amber-400 text-amber-400"
              )}
            />
          </button>
          <button
            type="button"
            onClick={() => onDelete?.(note.id)}
            className="p-2 sm:p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // Grid view
  return (
    <div className="group relative bg-card border border-border rounded-lg shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      {/* Thumbnail / Icon area */}
      {note.documentType === "PDF" && onPdfView && note.s3Url ? (
        <button
          type="button"
          onClick={() => onPdfView(note)}
          className="block w-full"
        >
          <div className={cn("h-28 flex items-center justify-center", bg)}>
            {note.thumbnailUrl ? (
              <img
                src={note.thumbnailUrl}
                alt={title}
                className="w-full h-full object-cover"
              />
            ) : (
              <TypeIcon className={cn("h-10 w-10", color)} />
            )}
          </div>
        </button>
      ) : (
        <Link href={`/notes/${note.id}`} className="block">
          <div className={cn("h-28 flex items-center justify-center", bg)}>
            {note.thumbnailUrl ? (
              <img
                src={note.thumbnailUrl}
                alt={title}
                className="w-full h-full object-cover"
              />
            ) : (
              <TypeIcon className={cn("h-10 w-10", color)} />
            )}
          </div>
        </Link>
      )}

      {/* Info */}
      <div className="p-3">
        <Link href={`/notes/${note.id}`} className="block">
          <p className="text-sm font-medium truncate hover:underline">{title}</p>
        </Link>
        <div className="flex items-center gap-2 mt-1">
          {note.folder && (
            <span className="text-xs text-muted-foreground truncate">
              {note.folder.name}
            </span>
          )}
          {isFileAttachment && (
            <span className="text-[0.6rem] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
              Semester
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {note.fileSize ? formatFileSize(note.fileSize) : formatDate(note.createdAt)}
          </span>
        </div>
      </div>

      {/* Hover actions */}
      <div className="absolute top-2 right-2 flex gap-1 touch-edit">
        <button
          type="button"
          onClick={() => onFavorite?.(note.id)}
          className={cn(
            "p-2 sm:p-1.5 rounded-md bg-white/90 shadow-sm backdrop-blur-sm transition-colors min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center",
            note.isFavorite
              ? "text-amber-400 hover:text-amber-500"
              : "text-muted-foreground hover:text-foreground"
          )}
          title={note.isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Star
            className={cn("h-3.5 w-3.5", note.isFavorite && "fill-amber-400")}
          />
        </button>
        <button
          type="button"
          onClick={() => onDelete?.(note.id)}
          className="p-2 sm:p-1.5 rounded-md bg-white/90 shadow-sm backdrop-blur-sm text-muted-foreground hover:text-destructive transition-colors min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
