import { getNoteById } from "@/features/notes/lib/queries";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Link } from "next-view-transitions";

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
      />

      <div className="space-y-4">
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
    </div>
  );
}
