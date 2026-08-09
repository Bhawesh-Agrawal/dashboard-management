"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Search, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

type WikilinkAutocompleteProps = {
  open: boolean;
  query: string;
  onSelect: (note: { id: string; title: string }) => void;
  onClose: () => void;
};

export function WikilinkAutocomplete({
  open,
  query,
  onSelect,
  onClose,
}: WikilinkAutocompleteProps) {
  const [notes, setNotes] = useState<Array<{ id: string; title: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const searchNotes = useCallback(async (searchQuery: string) => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/notes/graph?q=${encodeURIComponent(searchQuery)}`
      );
      if (response.ok) {
        const data = await response.json();
        setNotes(
          (data.nodes || []).map((n: { id: string; label: string }) => ({
            id: n.id,
            title: n.label || "Untitled",
          }))
        );
      }
    } catch {
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Search when open or query changes
  useEffect(() => {
    if (!open) return;
    searchNotes(query);
    setSelectedIndex(0);
  }, [open, query, searchNotes]);

  // Reset index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [notes]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, notes.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (notes[selectedIndex]) {
          onSelect(notes[selectedIndex]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, notes, selectedIndex, onSelect, onClose]);

  useEffect(() => {
    if (listRef.current) {
      const selected = listRef.current.children[selectedIndex] as HTMLElement;
      selected?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <div
        className="fixed inset-0 bg-background/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md bg-background border border-border rounded-lg shadow-xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={query}
            readOnly
            placeholder="Search notes to link..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted text-[0.6rem] text-muted-foreground">
            esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-64 overflow-y-auto py-1">
          {loading ? (
            <div className="px-4 py-6 text-center">
              <p className="text-xs text-muted-foreground">Searching...</p>
            </div>
          ) : notes.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-xs text-muted-foreground">
                {query ? `No notes matching "${query}"` : "No notes found"}
              </p>
            </div>
          ) : (
            notes.map((note, index) => (
              <button
                key={note.id}
                type="button"
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2 text-sm text-left transition-colors",
                  index === selectedIndex
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground hover:bg-accent/50"
                )}
                onClick={() => onSelect(note)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{note.title || "Untitled"}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
