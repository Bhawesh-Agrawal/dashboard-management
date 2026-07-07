"use client";

import { useState, useEffect, useCallback } from "react";
import { searchAction } from "@/features/search/lib/actions";
import type { SearchResult } from "@/features/search/lib/queries";
import { SearchResults } from "@/features/search/components/search-results";
import { Search, X } from "lucide-react";

export function SearchOverlay() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    setSearching(true);
    try {
      const searchResults = await searchAction(searchQuery);
      setResults(searchResults);
    } finally {
      setSearching(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim()) {
        handleSearch(query);
      } else {
        setResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, handleSearch]);

  // Keyboard shortcut listener
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      const input = document.getElementById("search-overlay-input") as HTMLInputElement | null;
      if (input) {
        input.focus();
        input.select();
      }
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Search dialog */}
      <div className="relative w-full max-w-lg mx-4 bg-background border border-border rounded-lg shadow-lg overflow-hidden">
        {/* Search input */}
        <div className="flex items-center border-b border-border px-4">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            id="search-overlay-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes, tasks, courses, quotes..."
            className="flex-1 h-12 px-3 bg-transparent text-sm focus:outline-none"
            autoComplete="off"
          />
          <button
            onClick={() => setOpen(false)}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto p-2">
          {searching ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">Searching...</p>
            </div>
          ) : results.length > 0 ? (
            <SearchResults results={results} />
          ) : query.trim() ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">No results found</p>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">
                Type to search across your data
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Press <kbd className="px-1 py-0.5 rounded border border-border bg-muted text-[0.6rem]">Esc</kbd> to close
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-4 py-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            <kbd className="px-1 py-0.5 rounded border border-border bg-muted">⌘K</kbd> to toggle
          </span>
          <span>
            <kbd className="px-1 py-0.5 rounded border border-border bg-muted">Esc</kbd> to close
          </span>
        </div>
      </div>
    </div>
  );
}
