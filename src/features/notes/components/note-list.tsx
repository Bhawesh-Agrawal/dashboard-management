"use client";

import type { NoteWithCourse } from "@/types";
import Link from "next/link";
import { EditNoteDialog } from "./edit-note-dialog";

export function NoteList({ notes }: { notes: NoteWithCourse[] }) {
  return (
    <div className="space-y-0.5">
      {notes.map((note) => (
        <div
          key={note.id}
          className="group relative block p-3 sm:p-3 rounded-md border border-border bg-card hover:bg-accent/50 transition-colors"
        >
          <Link href={`/notes/${note.id}`} className="block">
            <p className="text-sm line-clamp-2">{note.content}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-xs text-muted-foreground">
                {new Date(note.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
              {note.course && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  {note.course.name}
                </span>
              )}
              {note.tags.length > 0 && (
                <div className="flex gap-1 flex-wrap">
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
            </div>
          </Link>
          <div className="absolute top-3 right-3 touch-edit">
            <EditNoteDialog note={note} />
          </div>
        </div>
      ))}
    </div>
  );
}
