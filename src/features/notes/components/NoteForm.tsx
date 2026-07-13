"use client";

import { useState, useCallback } from "react";
import { Trash2 } from "lucide-react";
import { AttachmentSection } from "./AttachmentSection";
import { UploadDialog } from "./UploadDialog";
import type { NoteWithCourse } from "@/types";

export interface NoteFormProps {
  note?: NoteWithCourse;
  onSubmit: (data: {
    content: string;
    tags: string[];
    sourceLink: string | null;
  }) => Promise<void>;
  onDelete?: () => void;
  loading?: boolean;
}

export function NoteForm({ note, onSubmit, onDelete, loading = false }: NoteFormProps) {
  const [content, setContent] = useState(note?.content ?? "");
  const [tags, setTags] = useState(note?.tags.join(", ") ?? "");
  const [sourceLink, setSourceLink] = useState(note?.sourceLink ?? "");
  const [dragActive, setDragActive] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);

  const isEditing = !!note;

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files?.length) {
      setUploadDialogOpen(true);
    }
  }, []);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsedTags = tags
      ? tags.split(",").map((t) => t.trim()).filter(Boolean)
      : note?.tags ?? [];

    onSubmit({
      content,
      tags: parsedTags,
      sourceLink: sourceLink || null,
    });
  }

  function handleUploadDialogClose(open: boolean) {
    setUploadDialogOpen(open);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4"
      onDragOver={isEditing ? undefined : handleDragOver}
      onDragLeave={isEditing ? undefined : handleDragLeave}
      onDrop={isEditing ? undefined : handleDrop}
    >
      {/* Drag overlay */}
      {dragActive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-[var(--primary)] bg-[var(--primary)]/5 p-8">
            <p className="text-sm font-medium text-[var(--primary)]">
              Drop files to attach
            </p>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="space-y-2">
        <label htmlFor={`note-content${note?.id ? `-${note.id}` : ""}`} className="section-label">
          Content
        </label>
        <textarea
          id={`note-content${note?.id ? `-${note.id}` : ""}`}
          rows={6}
          required
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write your note…"
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none min-h-[120px]"
        />
      </div>

      {/* Tags */}
      <div className="space-y-2">
        <label htmlFor={`note-tags${note?.id ? `-${note.id}` : ""}`} className="section-label">
          Tags
        </label>
        <input
          id={`note-tags${note?.id ? `-${note.id}` : ""}`}
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="comma-separated tags"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      {/* Source Link */}
      <div className="space-y-2">
        <label htmlFor={`note-source${note?.id ? `-${note.id}` : ""}`} className="section-label">
          Source Link (OneDrive)
        </label>
        <input
          id={`note-source${note?.id ? `-${note.id}` : ""}`}
          type="url"
          value={sourceLink}
          onChange={(e) => setSourceLink(e.target.value)}
          placeholder="https://onedrive.live.com/..."
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      {/* Attachments (edit mode only) */}
      {isEditing && (
        <div className="rounded-lg border border-[#E5E2DD] bg-muted/20 p-3">
          <AttachmentSection
            noteId={note.id}
            initialAttachments={note.noteAttachments}
          />
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-2">
        {isEditing && onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            disabled={loading}
            className="inline-flex items-center gap-1 text-sm text-destructive hover:text-destructive/80 transition-colors disabled:opacity-50 min-h-[44px] px-2 py-1"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        ) : (
          <div />
        )}
        <button
          type="submit"
          disabled={loading || !content.trim()}
          className="inline-flex h-10 sm:h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 min-h-[44px]"
        >
          {loading ? "Saving…" : isEditing ? "Save Changes" : "Add Note"}
        </button>
      </div>

      {/* Upload dialog for drag-and-drop on create mode */}
      {!isEditing && (
        <UploadDialog
          open={uploadDialogOpen}
          onOpenChange={handleUploadDialogClose}
          noteId={undefined}
        />
      )}
    </form>
  );
}
