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
import { Pencil, Trash2 } from "lucide-react";

export function EditNoteDialog({
  note,
}: {
  note: NoteWithCourse;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const tagsStr = formData.get("tags") as string;
    const tags = tagsStr
      ? tagsStr.split(",").map((t) => t.trim()).filter(Boolean)
      : note.tags;

    await updateNote(note.id, {
      content: formData.get("content") as string,
      tags,
      courseId: (formData.get("courseId") as string) || null,
      sourceLink: (formData.get("sourceLink") as string) || null,
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
        render={<button className="p-1 text-muted-foreground hover:text-foreground transition-colors" />}
      >
        <Pencil className="h-3.5 w-3.5" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Edit Note</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <label htmlFor="edit-content" className="section-label">
              Content
            </label>
            <textarea
              id="edit-content"
              name="content"
              rows={6}
              required
              defaultValue={note.content}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="edit-tags" className="section-label">
              Tags
            </label>
            <input
              id="edit-tags"
              name="tags"
              defaultValue={note.tags.join(", ")}
              placeholder="comma-separated tags"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="edit-sourceLink" className="section-label">
              Source Link (OneDrive)
            </label>
            <input
              id="edit-sourceLink"
              name="sourceLink"
              type="url"
              defaultValue={note.sourceLink || ""}
              placeholder="https://onedrive.live.com/..."
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={loading}
              className="inline-flex items-center gap-1 text-sm text-destructive hover:text-destructive/80 transition-colors disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
