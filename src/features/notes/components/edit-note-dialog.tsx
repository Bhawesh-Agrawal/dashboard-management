"use client";

import { useState, useEffect } from "react";
import { updateNote, deleteNote } from "@/features/notes/lib/actions";
import { getCoursesForPicker } from "@/features/tasks/lib/actions";
import { getFolders } from "@/features/notes/lib/actions-folders";
import type { NoteWithCourse } from "@/types";
import type { LinkToOption } from "@/features/tasks/components/link-to-picker";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { NoteForm } from "./NoteForm";
import { Pencil } from "lucide-react";

type FolderOption = { id: string; name: string; type: string; _count: { notes: number; children: number } };

export function EditNoteDialog({
  note,
}: {
  note: NoteWithCourse;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [courses, setCourses] = useState<LinkToOption[]>([]);
  const [folders, setFolders] = useState<FolderOption[]>([]);

  useEffect(() => {
    if (open && courses.length === 0) {
      Promise.all([
        getCoursesForPicker(),
        getFolders(),
      ]).then(([c, f]) => {
        setCourses(c);
        setFolders(f);
      }).catch(() => {});
    }
  }, [open, courses.length]);

  async function handleSubmit(data: {
    content: string;
    tags: string[];
    sourceLink: string | null;
    courseId?: string | null;
    folderId?: string | null;
  }) {
    setLoading(true);

    await updateNote(note.id, {
      content: data.content,
      tags: data.tags,
      courseId: data.courseId ?? note.courseId,
      sourceLink: data.sourceLink,
      folderId: data.folderId,
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
      <DialogContent className="fixed inset-0 w-full h-full rounded-none sm:max-w-none max-w-none translate-x-0 translate-y-0 p-0 flex flex-col overflow-hidden">
        <NoteForm
          note={note}
          onSubmit={handleSubmit}
          onDelete={handleDelete}
          loading={loading}
          courses={courses}
          folders={folders}
        />
      </DialogContent>
    </Dialog>
  );
}
