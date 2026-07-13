"use client";

import Link from "next/link";
import { Globe, ExternalLink } from "lucide-react";
import { EditNoteDialog } from "./edit-note-dialog";
import type { NoteWithCourse } from "@/types";

function getSiteName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function truncateUrl(url: string, maxLen = 50): string {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname;
    const full = u.hostname + path;
    return full.length > maxLen ? full.slice(0, maxLen) + "…" : full;
  } catch {
    return url.length > maxLen ? url.slice(0, maxLen) + "…" : url;
  }
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export interface LinkListProps {
  links: NoteWithCourse[];
}

export function LinkList({ links }: LinkListProps) {
  if (links.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border border-dashed rounded-lg">
        <Globe className="h-10 w-10 mb-3 opacity-50" />
        <p className="text-sm">No links saved yet</p>
        <p className="text-xs mt-1">
          Add links from the note editor or use &quot;Add Link&quot; in attachments
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {links.map((note) => {
        const url = note.sourceLink || "";
        const siteName = url ? getSiteName(url) : "";
        const displayContent = note.content.slice(0, 120);

        return (
          <div
            key={note.id}
            className="group flex items-start gap-3 p-3 rounded-md border border-border bg-card hover:bg-accent/50 transition-colors"
          >
            {/* Favicon / icon */}
            <div className="shrink-0 h-8 w-8 rounded bg-green-50 flex items-center justify-center mt-0.5">
              <Globe className="h-4 w-4 text-green-500" />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <Link
                href={`/notes/${note.id}`}
                className="block text-sm font-medium hover:underline line-clamp-1"
              >
                {note.content.split("\n")[0] || "Untitled link"}
              </Link>

              {siteName && (
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-xs text-green-600">{siteName}</span>
                  <span className="text-xs text-muted-foreground/50">·</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {truncateUrl(url)}
                  </span>
                </div>
              )}

              {displayContent && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {displayContent}
                </p>
              )}

              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-xs text-muted-foreground">
                  {formatDate(note.createdAt)}
                </span>
                {note.tags.length > 0 && (
                  <div className="flex gap-1">
                    {note.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="text-[0.6rem] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 touch-edit shrink-0">
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 sm:p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
                  title="Open link"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              <div className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center">
                <EditNoteDialog note={note} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
