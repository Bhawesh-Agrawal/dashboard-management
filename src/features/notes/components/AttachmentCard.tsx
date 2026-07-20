"use client";

import { useState } from "react";
import {
  FileText,
  Image,
  Video,
  Music,
  File,
  Globe,
  ExternalLink,
  Trash2,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { removeNoteAttachment, updateNoteAttachment } from "@/features/notes/lib/actions-attachments";
import type { NoteAttachment } from "@prisma/client";

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function getTypeIcon(type: NoteAttachment["type"]) {
  switch (type) {
    case "PDF":
      return { icon: FileText, color: "text-red-500" };
    case "IMAGE":
      return { icon: Image, color: "text-blue-500" };
    case "VIDEO":
      return { icon: Video, color: "text-purple-500" };
    case "AUDIO":
      return { icon: Music, color: "text-amber-500" };
    case "LINK":
      return { icon: Globe, color: "text-green-500" };
    case "DOCUMENT":
    case "TEXT":
      return { icon: FileText, color: "text-sky-500" };
    default:
      return { icon: File, color: "text-muted-foreground" };
  }
}

function truncateUrl(url: string, maxLen = 40): string {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname;
    const full = u.host + path;
    return full.length > maxLen ? full.slice(0, maxLen) + "…" : full;
  } catch {
    return url.length > maxLen ? url.slice(0, maxLen) + "…" : url;
  }
}

function getSiteName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export interface AttachmentCardProps {
  attachment: NoteAttachment;
  onRemoved?: () => void;
  onView?: (attachment: NoteAttachment) => void;
}

export function AttachmentCard({ attachment, onRemoved, onView }: AttachmentCardProps) {
  const [removing, setRemoving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(attachment.title);
  const [saving, setSaving] = useState(false);

  const { icon: TypeIcon, color } = getTypeIcon(attachment.type);
  const isLink = attachment.type === "LINK";

  async function handleRemove() {
    if (!confirm("Remove this attachment?")) return;
    setRemoving(true);
    const result = await removeNoteAttachment(attachment.id);
    if (result.ok) {
      onRemoved?.();
    } else {
      setRemoving(false);
    }
  }

  async function handleSaveTitle() {
    if (!title.trim() || title === attachment.title) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const result = await updateNoteAttachment(attachment.id, { title: title.trim() });
    if (result.ok) {
      setEditing(false);
    }
    setSaving(false);
  }

  function handleCancelEdit() {
    setTitle(attachment.title);
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSaveTitle();
    if (e.key === "Escape") handleCancelEdit();
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-2.5 rounded-md bg-white shadow-sm border border-[#E5E2DD]",
        "hover:bg-muted/20 transition-colors group",
        removing && "opacity-50 pointer-events-none"
      )}
    >
      {/* Type icon */}
      <div className="shrink-0">
        <TypeIcon className={cn("h-4 w-4", color)} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSaveTitle}
              autoFocus
              className="flex-1 h-6 rounded border border-input bg-background px-1.5 text-sm"
            />
            <button
              type="button"
              onClick={handleSaveTitle}
              disabled={saving}
              className="p-0.5 text-[var(--chart-2)] hover:text-[var(--chart-2)]/80"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={handleCancelEdit}
              className="p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate">{attachment.title}</p>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Rename"
            >
              <Pencil className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Metadata line */}
        <div className="flex items-center gap-2 mt-0.5">
          {isLink ? (
            <>
              <span className="text-xs text-muted-foreground">
                {getSiteName(attachment.s3Url)}
              </span>
              <span className="text-xs text-muted-foreground/50">·</span>
              <span className="text-xs text-muted-foreground truncate">
                {truncateUrl(attachment.s3Url)}
              </span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">
              {formatFileSize(attachment.fileSize)}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {isLink ? (
          <a
            href={attachment.s3Url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            Open
          </a>
        ) : (
          <button
            type="button"
            onClick={() => onView?.(attachment)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            View
          </button>
        )}
        <button
          type="button"
          onClick={handleRemove}
          disabled={removing}
          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors disabled:opacity-50"
        >
          <Trash2 className="h-3 w-3" />
          Remove
        </button>
      </div>
    </div>
  );
}
