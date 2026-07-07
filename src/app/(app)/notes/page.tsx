import { getNotes } from "@/features/notes/lib/queries";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { NoteList } from "@/features/notes/components/note-list";
import { QuickCapture } from "@/features/notes/components/quick-capture";

export default async function NotesPage() {
  const notes = await getNotes();

  return (
    <div>
      <PageHeader
        title="Notes"
        subtitle={`${notes.length} note${notes.length !== 1 ? "s" : ""}`}
        action={<QuickCapture />}
      />

      {notes.length === 0 ? (
        <EmptyState
          title="No notes yet"
          description="Quickly capture ideas, lecture notes, or anything you need to remember."
          action={<QuickCapture />}
        />
      ) : (
        <NoteList notes={notes} />
      )}
    </div>
  );
}
