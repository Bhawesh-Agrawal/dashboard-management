"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { NoteWithScore } from "@/types";

type RelatedNotesPanelProps = {
  noteId: string;
};

export function RelatedNotesPanel({ noteId }: RelatedNotesPanelProps) {
  const [relatedNotes, setRelatedNotes] = useState<NoteWithScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRelatedNotes() {
      try {
        setLoading(true);
        const response = await fetch(`/api/notes/${noteId}/related`);
        if (!response.ok) throw new Error("Failed to fetch related notes");
        const data = await response.json();
        setRelatedNotes(data.notes || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchRelatedNotes();
  }, [noteId]);

  if (loading) {
    return (
      <div className="space-y-3">
        <p className="section-label">Related Notes</p>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-muted animate-pulse rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <p className="section-label">Related Notes</p>
        <p className="text-xs text-muted-foreground">Unable to load related notes</p>
      </div>
    );
  }

  if (relatedNotes.length === 0) {
    return (
      <div className="space-y-3">
        <p className="section-label">Related Notes</p>
        <p className="text-xs text-muted-foreground">
          No related notes found. Add more notes to build connections.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="section-label">Related Notes</p>
      <div className="space-y-2">
        {relatedNotes.map((note) => (
          <Link
            key={note.id}
            href={`/notes/${note.id}`}
            className="block p-2 rounded-md border border-border bg-card hover:bg-accent/50 transition-colors"
          >
            <p className="text-xs line-clamp-2 text-foreground">{note.contextSnippet}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <StrengthIndicator strength={note.score} />
              <span className="text-[0.6rem] text-muted-foreground">
                {note.linkType === "semantic" ? "semantic" : "explicit"}
              </span>
              {note.course && (
                <span className="text-[0.6rem] text-muted-foreground">
                  {note.course.name}
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function StrengthIndicator({ strength }: { strength: number }) {
  // Convert 0-1 strength to 1-5 dots
  const dots = Math.round(strength * 5);

  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className={`w-1 h-1 rounded-full ${
            i <= dots ? "bg-foreground" : "bg-muted"
          }`}
        />
      ))}
    </div>
  );
}

type BacklinksPanelProps = {
  noteId: string;
};

export function BacklinksPanel({ noteId }: BacklinksPanelProps) {
  const [backlinks, setBacklinks] = useState<NoteWithScore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchBacklinks() {
      try {
        const response = await fetch(`/api/notes/${noteId}/backlinks`);
        if (!response.ok) throw new Error("Failed to fetch backlinks");
        const data = await response.json();
        setBacklinks(data.notes || []);
      } catch {
        // Silently fail for backlinks
      } finally {
        setLoading(false);
      }
    }

    fetchBacklinks();
  }, [noteId]);

  if (loading || backlinks.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="section-label">Backlinks</p>
      <div className="space-y-2">
        {backlinks.map((note) => (
          <Link
            key={note.id}
            href={`/notes/${note.id}`}
            className="block p-2 rounded-md border border-border bg-card hover:bg-accent/50 transition-colors"
          >
            <p className="text-xs line-clamp-2 text-foreground">{note.contextSnippet}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <StrengthIndicator strength={note.score} />
              <span className="text-[0.6rem] text-muted-foreground">
                links to this note
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
