"use client";

import { useState, useCallback } from "react";
import { Trash2, Paperclip } from "lucide-react";
import { AttachmentSection } from "./AttachmentSection";
import { UploadDialog } from "./UploadDialog";
import { MarkdownEditor } from "./MarkdownEditor";
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
  const [showMetadata, setShowMetadata] = useState(!!note?.sourceLink || !!note?.tags.length);

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
      className="flex flex-col h-full"
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

      {/* Compact Metadata Bar */}
      <div className="flex items-center gap-3 px-1 py-2 text-sm border-b border-border/50">
        {/* Tags */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <input
            id={`note-tags${note?.id ? `-${note.id}` : ""}`}
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Add tags..."
            className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground/60 focus:ring-0 min-w-0"
          />
        </div>

        {/* Source Link */}
        {showMetadata && (
          <div className="flex items-center gap-2">
            <input
              id={`note-source${note?.id ? `-${note.id}` : ""}`}
              type="url"
              value={sourceLink}
              onChange={(e) => setSourceLink(e.target.value)}
              placeholder="Source URL..."
              className="w-48 bg-transparent border-none outline-none text-sm text-muted-foreground placeholder:text-muted-foreground/60 focus:ring-0"
            />
          </div>
        )}

        {/* Toggle metadata */}
        <button
          type="button"
          onClick={() => setShowMetadata(!showMetadata)}
          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
          title={showMetadata ? "Hide metadata" : "Show metadata"}
        >
          <Paperclip className="h-4 w-4" />
        </button>
      </div>

      {/* Main Content Area - Fills remaining space */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <MarkdownEditor
          id={`note-content${note?.id ? `-${note.id}` : ""}`}
          value={content}
          onChange={setContent}
          placeholder="Start writing..."
          fillHeight
        />
      </div>

      {/* Attachments (edit mode only) */}
      {isEditing && (
        <div className="border-t border-border/50 px-1 py-2">
          <AttachmentSection
            noteId={note.id}
            initialAttachments={note.noteAttachments}
          />
        </div>
      )}

      {/* Footer - Compact */}
      <div className="flex items-center justify-between px-1 py-3 border-t border-border/50">
        {isEditing && onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-sm text-destructive hover:text-destructive/80 transition-colors disabled:opacity-50 px-2 py-1"
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
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
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
