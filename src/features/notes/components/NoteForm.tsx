"use client";

import { useState, useCallback } from "react";
import { Trash2, Paperclip } from "lucide-react";
import { AttachmentSection } from "./AttachmentSection";
import { UploadDialog } from "./UploadDialog";
import { MarkdownEditor } from "./MarkdownEditor";
import type { NoteWithCourse } from "@/types";
import type { LinkToOption } from "@/features/tasks/components/link-to-picker";

type FolderOption = { id: string; name: string; type: string };

export interface NoteFormProps {
  note?: NoteWithCourse;
  onSubmit: (data: {
    content: string;
    tags: string[];
    sourceLink: string | null;
    courseId?: string | null;
    folderId?: string | null;
  }) => Promise<void>;
  onDelete?: () => void;
  loading?: boolean;
  courses?: LinkToOption[];
  folders?: FolderOption[];
}

export function NoteForm({ note, onSubmit, onDelete, loading = false, courses = [], folders = [] }: NoteFormProps) {
  const [content, setContent] = useState(note?.content ?? "");
  const [tags, setTags] = useState(note?.tags.join(", ") ?? "");
  const [sourceLink, setSourceLink] = useState(note?.sourceLink ?? "");
  const [courseId, setCourseId] = useState(note?.courseId ?? "");
  const [folderId, setFolderId] = useState(note?.folder?.id ?? "");
  const [dragActive, setDragActive] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [showMetadata, setShowMetadata] = useState(!!note?.sourceLink || !!note?.tags.length);

  const isEditing = !!note;
  const hasMoreOptions = courses.length > 0 || folders.length > 0;

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
      courseId: courseId || null,
      folderId: folderId || null,
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

      {/* More options — Course / Folder */}
      {hasMoreOptions && (
        <details className="text-xs border-b border-border/50">
          <summary className="cursor-pointer px-1 py-2 text-muted-foreground hover:text-foreground transition-colors list-none flex items-center gap-1">
            <span>+ More options (Course, Folder)</span>
          </summary>
          <div className="space-y-3 px-1 pb-3">
            {courses.length > 0 && (
              <div className="space-y-1">
                <label htmlFor={`note-course${note?.id ? `-${note.id}` : ""}`} className="section-label">Course</label>
                <select
                  id={`note-course${note?.id ? `-${note.id}` : ""}`}
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">None</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
            {folders.length > 0 && (
              <div className="space-y-1">
                <label htmlFor={`note-folder${note?.id ? `-${note.id}` : ""}`} className="section-label">Folder</label>
                <select
                  id={`note-folder${note?.id ? `-${note.id}` : ""}`}
                  value={folderId}
                  onChange={(e) => setFolderId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">None</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </details>
      )}

      {/* Main Content Area - Fills remaining space */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <MarkdownEditor
          id={`note-content${note?.id ? `-${note.id}` : ""}`}
          value={content}
          onChange={setContent}
          placeholder="Start writing..."
          fillHeight
          noteId={note?.id}
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
