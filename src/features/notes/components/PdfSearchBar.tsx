"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Search,
  ChevronUp,
  ChevronDown,
  X,
  Highlighter,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export interface PdfSearchBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  results: { pageNumber: number; matchIndex: number }[];
  currentMatchIndex: number;
  onResultNavigate: (index: number) => void;
  highlightAll: boolean;
  onToggleHighlightAll: () => void;
  onClose: () => void;
}

export function PdfSearchBar({
  query,
  onQueryChange,
  results,
  currentMatchIndex,
  onResultNavigate,
  highlightAll,
  onToggleHighlightAll,
  onClose,
}: PdfSearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localQuery, setLocalQuery] = useState(query);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounce the query
  useEffect(() => {
    const timer = setTimeout(() => {
      onQueryChange(localQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [localQuery, onQueryChange]);

  const handleNext = useCallback(() => {
    if (results.length === 0) return;
    onResultNavigate((currentMatchIndex + 1) % results.length);
  }, [results.length, currentMatchIndex, onResultNavigate]);

  const handlePrev = useCallback(() => {
    if (results.length === 0) return;
    onResultNavigate(
      (currentMatchIndex - 1 + results.length) % results.length
    );
  }, [results.length, currentMatchIndex, onResultNavigate]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter") {
        if (e.shiftKey) handlePrev();
        else handleNext();
      }
    },
    [onClose, handleNext, handlePrev]
  );

  return (
    <div className="absolute top-14 right-2 sm:right-4 left-2 sm:left-auto z-40 bg-popover border rounded-lg shadow-lg p-2 flex items-center gap-2">
      <Search className="h-4 w-4 text-muted-foreground shrink-0" />

      <input
        ref={inputRef}
        type="text"
        value={localQuery}
        onChange={(e) => setLocalQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find in document..."
        className="flex-1 sm:w-48 h-8 sm:h-7 text-sm bg-background border rounded px-2 outline-none focus:ring-1 focus:ring-ring min-h-[44px] sm:min-h-0"
      />

      {results.length > 0 && (
        <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums hidden sm:inline">
          {currentMatchIndex + 1} of {results.length}
        </span>
      )}

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={handlePrev}
        disabled={results.length === 0}
        className="h-8 w-8 sm:h-6 sm:w-6 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </Button>

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={handleNext}
        disabled={results.length === 0}
        className="h-8 w-8 sm:h-6 sm:w-6 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>

      <Button
        variant={highlightAll ? "secondary" : "ghost"}
        size="icon-sm"
        onClick={onToggleHighlightAll}
        title="Highlight all matches"
        className="h-8 w-8 sm:h-6 sm:w-6 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
      >
        <Highlighter className="h-3.5 w-3.5" />
      </Button>

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onClose}
        className="h-8 w-8 sm:h-6 sm:w-6 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
