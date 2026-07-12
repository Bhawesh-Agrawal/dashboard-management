"use client";

import { useState, useCallback } from "react";
import { Paperclip, Link as LinkIcon, ChevronDown, ChevronUp } from "lucide-react";
import { UploadDialog } from "./UploadDialog";
import { AddLinkDialog } from "./AddLinkDialog";
import { AttachmentCard } from "./AttachmentCard";
import { getNoteAttachments } from "@/features/notes/lib/actions-attachments";
import type { NoteAttachment } from "@prisma/client";

export interface AttachmentSectionProps {
  noteId: string;
  initialAttachments?: NoteAttachment[];
}

const COLLAPSE_THRESHOLD = 3;

export function AttachmentSection({
  noteId,
  initialAttachments = [],
}: AttachmentSectionProps) {
  const [attachments, setAttachments] = useState<NoteAttachment[]>(initialAttachments);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const refresh = useCallback(async () => {
    const result = await getNoteAttachments(noteId);
    setAttachments(result);
  }, [noteId]);

  const needsCollapse = attachments.length > COLLAPSE_THRESHOLD;
  const visibleAttachments = needsCollapse && !expanded
    ? attachments.slice(0, COLLAPSE_THRESHOLD)
    : attachments;
  const hiddenCount = attachments.length - COLLAPSE_THRESHOLD;

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <label className="section-label flex items-center gap-1.5">
          <Paperclip className="h-3.5 w-3.5" />
          Attachments
          {attachments.length > 0 && (
            <span className="text-muted-foreground font-normal">
              ({attachments.length})
            </span>
          )}
        </label>
      </div>

      {/* Empty state or list */}
      {attachments.length === 0 ? (
        <p className="text-xs text-muted-foreground py-1">
          No attachments yet
        </p>
      ) : (
        <div className="space-y-1.5">
          {visibleAttachments.map((attachment) => (
            <AttachmentCard
              key={attachment.id}
              attachment={attachment}
              onRemoved={refresh}
            />
          ))}

          {needsCollapse && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-0.5"
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-3 w-3" />
                  Hide {hiddenCount} attachment{hiddenCount !== 1 ? "s" : ""}
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" />
                  Show {hiddenCount} more attachment{hiddenCount !== 1 ? "s" : ""}
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 pt-0.5">
        <button
          type="button"
          onClick={() => setUploadDialogOpen(true)}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <Paperclip className="h-3 w-3" />
          Attach File
        </button>
        <span className="text-muted-foreground/40">·</span>
        <button
          type="button"
          onClick={() => setLinkDialogOpen(true)}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <LinkIcon className="h-3 w-3" />
          Add Link
        </button>
      </div>

      {/* Sub-dialogs */}
      <UploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        noteId={noteId}
        onUploadComplete={refresh}
      />
      <AddLinkDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        noteId={noteId}
        onAdd={refresh}
      />
    </div>
  );
}
