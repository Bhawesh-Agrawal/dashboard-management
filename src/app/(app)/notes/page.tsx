import { getNotes } from "@/features/notes/lib/queries";
import { NotesPageClient } from "@/features/notes/components/NotesPageClient";

export const revalidate = 0;

export default async function NotesPage() {
  const notes = await getNotes();

  return (
    <NotesPageClient
      initialNotes={notes}
      noteCount={notes.length}
    />
  );
}
