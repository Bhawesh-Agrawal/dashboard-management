"use client";

import { useState } from "react";
import { createNote } from "@/features/notes/lib/actions";
import type { Note } from "@prisma/client";

export function CourseNotesSection({
  courseId,
  notes,
}: {
  courseId: string;
  notes: Note[];
}) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="section-label">Notes</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          + Add
        </button>
      </div>

      {showForm && (
        <AddNoteForm courseId={courseId} onDone={() => setShowForm(false)} />
      )}

      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notes for this course.</p>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => (
            <div key={note.id} className="p-3 rounded-md border border-border bg-card">
              <p className="text-sm line-clamp-3">{note.content}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-muted-foreground">
                  {new Date(note.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
                {note.tags.length > 0 && (
                  <div className="flex gap-1">
                    {note.tags.map((tag) => (
                      <span key={tag} className="text-[0.6rem] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddNoteForm({
  courseId,
  onDone,
}: {
  courseId: string;
  onDone: () => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);

    await createNote({
      content: formData.get("content") as string,
      courseId,
      tags: formData.get("tags")
        ? (formData.get("tags") as string).split(",").map((t) => t.trim())
        : [],
      sourceLink: (formData.get("sourceLink") as string) || undefined,
    });

    setLoading(false);
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-3 rounded-md border border-border bg-card mb-3">
      <textarea
        name="content"
        required
        placeholder="Write a note..."
        rows={3}
        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
      />
      <div className="flex items-end gap-3">
        <input
          name="tags"
          placeholder="Tags (comma-separated)"
          className="flex-1 h-9 rounded-md border border-input bg-background px-2 text-sm"
        />
        <input
          name="sourceLink"
          type="url"
          placeholder="Source URL (optional)"
          className="flex-1 h-9 rounded-md border border-input bg-background px-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
      >
        {loading ? "..." : "Save Note"}
      </button>
    </form>
  );
}
