import { getNoteById } from "@/features/notes/lib/queries";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import Link from "next/link";
import { RelatedNotesPanel, BacklinksPanel } from "@/features/notes/components/related-notes-panel";
import { ReviewButton } from "@/features/notes/components/review-button";
import { EditNoteDialog } from "@/features/notes/components/edit-note-dialog";

export default async function NoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const note = await getNoteById(id);

  if (!note) notFound();

  return (
    <div>
      <PageHeader
        title="Note"
        subtitle={new Date(note.createdAt).toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })}
        action={
          <div className="flex items-center gap-2">
            <ReviewButton noteId={note.id} />
            <EditNoteDialog note={note} />
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-4">
          {note.s3Url && note.isDocumentLibraryEntry && (
            <div className="mb-6 rounded-lg border border-border overflow-hidden bg-muted/30">
              {note.documentType === "IMAGE" ? (
                <img src={note.s3Url} alt={note.title || "Image"} className="w-full max-h-[600px] object-contain" />
              ) : note.documentType === "VIDEO" ? (
                <video src={note.s3Url} controls className="w-full max-h-[600px]" />
              ) : note.documentType === "AUDIO" ? (
                <div className="p-6 flex justify-center">
                  <audio src={note.s3Url} controls className="w-full max-w-md" />
                </div>
              ) : note.documentType === "PDF" ? (
                <div className="p-8 text-center space-y-3">
                  <p className="text-sm text-muted-foreground">This is a PDF document.</p>
                  <a href={note.s3Url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium">
                    Open PDF
                  </a>
                </div>
              ) : (
                <div className="p-8 text-center space-y-3">
                  <p className="text-sm text-muted-foreground">This file cannot be previewed directly.</p>
                  <a href={note.s3Url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium">
                    Download File
                  </a>
                </div>
              )}
            </div>
          )}

          <div className="prose prose-sm max-w-none">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{note.content}</p>
          </div>

          <div className="flex items-center gap-3 pt-4 border-t border-border">
            {note.course && (
              <Link
                href={`/courses/${note.course.id}`}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                {note.course.name}
              </Link>
            )}
            {note.tags.length > 0 && (
              <div className="flex gap-1">
                {note.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[0.6rem] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {note.sourceLink && (
              <a
                href={note.sourceLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Source
              </a>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <RelatedNotesPanel noteId={note.id} />
          <BacklinksPanel noteId={note.id} />
        </div>
      </div>
    </div>
  );
}
