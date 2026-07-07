import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { getPeople } from "@/features/people/lib/queries";
import { PersonList } from "@/features/people/components/person-list";
import { CreatePersonDialog } from "@/features/people/components/person-form";

export default async function PeoplePage() {
  const people = await getPeople();

  return (
    <div>
      <PageHeader
        title="People"
        subtitle={`${people.length} contact${people.length !== 1 ? "s" : ""}`}
        action={<CreatePersonDialog />}
      />
      {people.length === 0 ? (
        <EmptyState
          title="No people yet"
          description="Add contacts to keep track of your network — birthdays, notes, and interaction history."
          action={<CreatePersonDialog />}
        />
      ) : (
        <PersonList people={people} />
      )}
    </div>
  );
}
