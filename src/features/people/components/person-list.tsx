"use client";

import Link from "next/link";
import { deletePerson } from "@/features/people/lib/actions";
import { EditPersonDialog } from "./edit-person-dialog";

type PersonData = {
  id: string;
  name: string;
  birthday: Date | null;
  notes: string | null;
};

export function PersonList({ people }: { people: PersonData[] }) {
  if (people.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No people yet. Add contacts to keep track of your network.
      </p>
    );
  }

  return (
    <div className="space-y-0.5">
      {people.map((person) => (
        <PersonRow key={person.id} person={person} />
      ))}
    </div>
  );
}

function PersonRow({ person }: { person: PersonData }) {
  const birthdayDisplay = person.birthday
    ? new Date(person.birthday).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
      })
    : null;

  // Check if birthday is upcoming (within 30 days)
  const isUpcomingBirthday = (() => {
    if (!person.birthday) return false;
    const now = new Date();
    const bday = new Date(person.birthday);
    bday.setFullYear(now.getFullYear());
    if (bday < now) bday.setFullYear(now.getFullYear() + 1);
    const diff = bday.getTime() - now.getTime();
    return diff >= 0 && diff <= 30 * 24 * 60 * 60 * 1000;
  })();

  return (
    <div className="list-row items-center group">
      <Link href={`/people/${person.id}`} className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{person.name}</span>
          {isUpcomingBirthday && (
            <span className="text-xs text-muted-foreground">{birthdayDisplay}</span>
          )}
        </div>
        {person.notes && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {person.notes.slice(0, 80)}
          </p>
        )}
      </Link>

      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
        <EditPersonDialog person={person} />
        <button
          onClick={() => deletePerson(person.id)}
          className="p-1 rounded hover:bg-accent transition-colors text-destructive"
        >
          ×
        </button>
      </div>
    </div>
  );
}
