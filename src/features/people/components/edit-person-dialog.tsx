"use client";

import { useState } from "react";
import { updatePerson } from "@/features/people/lib/actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Pencil } from "lucide-react";

type PersonData = {
  id: string;
  name: string;
  birthday: Date | null;
  notes: string | null;
};

export function EditPersonDialog({ person }: { person: PersonData }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const birthdayStr = person.birthday
    ? new Date(person.birthday).toISOString().split("T")[0]
    : "";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const birthdayVal = formData.get("birthday") as string;

    await updatePerson(person.id, {
      name: formData.get("name") as string,
      birthday: birthdayVal || null,
      notes: (formData.get("notes") as string) || undefined,
    });

    setLoading(false);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<button className="p-1 rounded hover:bg-accent transition-colors" />}>
        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Edit Person</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <label htmlFor="edit-name" className="section-label">Name</label>
            <input
              id="edit-name"
              name="name"
              required
              defaultValue={person.name}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="edit-birthday" className="section-label">Birthday</label>
            <input
              id="edit-birthday"
              name="birthday"
              type="date"
              defaultValue={birthdayStr}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="edit-notes" className="section-label">Notes</label>
            <textarea
              id="edit-notes"
              name="notes"
              rows={4}
              defaultValue={person.notes || ""}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              placeholder="Facts, interactions, anything to remember..."
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save Changes"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
