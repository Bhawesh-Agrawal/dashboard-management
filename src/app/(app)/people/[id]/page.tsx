import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { getPersonById } from "@/features/people/lib/queries";
import { EditPersonDialog } from "@/features/people/components/edit-person-dialog";

export default async function PersonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const person = await getPersonById(id);

  if (!person) notFound();

  const birthdayDisplay = person.birthday
    ? new Date(person.birthday).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div>
      <PageHeader
        title={person.name}
        subtitle={birthdayDisplay ? `Birthday: ${birthdayDisplay}` : undefined}
        backHref="/people"
        action={<EditPersonDialog person={person} />}
      />

      <div className="space-y-8">
        <section>
          <h2 className="section-label mb-3">Notes</h2>
          {person.notes ? (
            <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm">
              {person.notes}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No notes yet. Add facts, interaction logs, or anything to remember.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
