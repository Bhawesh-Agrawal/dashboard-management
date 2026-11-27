import { getInboxNotes } from "@/features/notes/lib/inbox-queries";
import { NotesInboxClient } from "@/features/notes/components/NotesInboxClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{ capture?: string }>;
}) {
  const params = await searchParams;
  const initialNotes = await getInboxNotes({ filter: "all", limit: 50 });

  return (
    <NotesInboxClient
      initialNotes={initialNotes}
      openCaptureOnMount={params.capture === "1"}
    />
  );
}
