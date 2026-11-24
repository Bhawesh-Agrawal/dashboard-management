"use client";

import { useState, useTransition } from "react";
import { searchAction } from "@/features/search/lib/actions";
import type { SearchResult } from "@/features/search/lib/queries";
import { SearchResults } from "@/features/search/components/search-results";
import { Search } from "lucide-react";

export function SearchClient() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, startSearchTransition] = useTransition();
  const [hasSearched, setHasSearched] = useState(false);

  async function handleSearch(searchQuery: string) {
    if (!searchQuery.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    startSearchTransition(async () => {
      const searchResults = await searchAction(searchQuery);
      setResults(searchResults);
      setHasSearched(true);
    });
  }

  return (
    <div>
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            handleSearch(e.target.value);
          }}
          placeholder="Search notes, tasks, courses, projects..."
          className="w-full h-10 pl-10 pr-4 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          autoFocus
        />
      </div>

      {/* Results */}
      <div className="mt-6">
        {searching ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Searching...</p>
          </div>
        ) : hasSearched ? (
          <SearchResults results={results} />
        ) : (
          <div className="text-center py-12">
            <Search className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              Type to search across your notes, tasks, courses, and projects
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
