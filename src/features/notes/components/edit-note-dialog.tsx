"use client";

import { useState } from "react";
import { updateNote, deleteNote } from "@/features/notes/lib/actions";
import type { NoteWithCourse } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { NoteForm } from "./NoteForm";
import { Pencil } from "lucide-react";

export function EditNoteDialog({
  note,
}: {
  note: NoteWithCourse;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(data: {
    content: string;
    tags: string[];
    sourceLink: string | null;
  }) {
    setLoading(true);

    await updateNote(note.id, {
      content: data.content,
      tags: data.tags,
      courseId: note.courseId,
      sourceLink: data.sourceLink,
    });

    setLoading(false);
    setOpen(false);
  }

  async function handleDelete() {
    if (!confirm("Delete this note?")) return;
    setLoading(true);
    await deleteNote(note.id);
    setLoading(false);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<button className="p-2 sm:p-1 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center" />}
      >
        <Pencil className="h-3.5 w-3.5" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg w-[calc(100%-2rem)]">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Edit Note</DialogTitle>
        </DialogHeader>
        <div className="mt-4">
          <NoteForm
            note={note}
            onSubmit={handleSubmit}
            onDelete={handleDelete}
            loading={loading}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
