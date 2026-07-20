"use client";

import { useState, useCallback, useEffect } from "react";
import { Paperclip, Loader2 } from "lucide-react";
import { getDocumentNotes, deleteDocumentNote } from "@/features/notes/lib/actions-documents";
import { DocumentUploadDialog } from "@/features/notes/components/DocumentUploadDialog";
import { DocumentCard } from "@/features/notes/components/DocumentCard";
import { FileViewerModal } from "@/features/notes/components/FileViewerModal";
import type { Prisma } from "@prisma/client";

type NoteWithRelations = Prisma.NoteGetPayload<{
  include: {
    course: { select: { id: true; name: true; color: true } };
    folder: { select: { id: true; name: true; type: true; color: true } };
    task: { select: { id: true; title: true } };
    project: { select: { id: true; name: true; color: true } };
    noteAttachments: true;
    _count: { select: { noteAttachments: true; annotations: true } };
  };
}>;

export interface LinkedNotesSectionProps {
  taskId?: string;
  projectId?: string;
}

export function LinkedNotesSection({ taskId, projectId }: LinkedNotesSectionProps) {
  const [notes, setNotes] = useState<NoteWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<any>(null);

  const fetchNotes = useCallback(async () => {
    if (!taskId && !projectId) {
      setNotes([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const result = await getDocumentNotes({
      taskId: taskId || undefined,
      projectId: projectId || undefined,
      page: 1,
      pageSize: 20,
    });

    if (result.ok) {
      setNotes(result.data.notes);
    }
    setLoading(false);
  }, [taskId, projectId]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this attachment?")) {
      await deleteDocumentNote(id);
      fetchNotes();
    }
  };

  const handleView = (note: any) => {
    setSelectedNote(note);
    setViewerOpen(true);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="section-label flex items-center gap-1.5">
          <Paperclip className="h-3.5 w-3.5" />
          Attachments
          {!loading && notes.length > 0 && (
            <span className="text-muted-foreground font-normal">
              ({notes.length})
            </span>
          )}
        </label>
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
        >
          Add Attachment
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : notes.length === 0 ? (
        <p className="text-sm text-muted-foreground bg-muted/30 border border-border/50 rounded-md p-3 text-center">
          No attachments yet
        </p>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => (
            <div key={note.id} className="relative group">
              <DocumentCard note={note as any} viewMode="list" onDelete={handleDelete} onView={handleView} />
            </div>
          ))}
        </div>
      )}

      <DocumentUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploadComplete={fetchNotes}
        {...(taskId ? { taskId } : {})}
        {...(projectId ? { projectId } : {})}
      />
      <FileViewerModal
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        note={selectedNote}
      />
    </div>
  );
}
