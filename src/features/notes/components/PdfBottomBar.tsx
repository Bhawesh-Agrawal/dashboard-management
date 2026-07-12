"use client";

import { useState, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export interface PdfBottomBarProps {
  currentPage: number;
  totalPages: number;
  zoom: number;
  onPageChange: (page: number) => void;
  onZoomChange?: (zoom: number) => void;
  isMobile?: boolean;
}

export function PdfBottomBar({
  currentPage,
  totalPages,
  zoom,
  onPageChange,
  onZoomChange: _onZoomChange, // eslint-disable-line @typescript-eslint/no-unused-vars
  isMobile = false,
}: PdfBottomBarProps) {
  const [pageInput, setPageInput] = useState(String(currentPage));
  const [editing, setEditing] = useState(false);

  const handlePageSubmit = useCallback(() => {
    const num = parseInt(pageInput, 10);
    if (!isNaN(num) && num >= 1 && num <= totalPages) {
      onPageChange(num);
    } else {
      setPageInput(String(currentPage));
    }
    setEditing(false);
  }, [pageInput, totalPages, currentPage, onPageChange]);

  const handlePageKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handlePageSubmit();
      if (e.key === "Escape") {
        setPageInput(String(currentPage));
        setEditing(false);
      }
    },
    [handlePageSubmit, currentPage]
  );

  return (
    <div className="sticky bottom-0 z-30 flex items-center justify-between h-10 px-3 border-t bg-background/95 backdrop-blur-sm shrink-0">
      {/* Left: Page info */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {!isMobile && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onPageChange(1)}
            disabled={currentPage <= 1}
            title="First page (Home)"
            className="h-6 w-6"
          >
            <ChevronsLeft className="h-3.5 w-3.5" />
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          title="Previous page (←)"
          className="h-6 w-6"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>

        {editing ? (
          <input
            type="number"
            min={1}
            max={totalPages}
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onBlur={handlePageSubmit}
            onKeyDown={handlePageKeyDown}
            autoFocus
            className="w-12 h-5 text-center text-xs border rounded bg-background px-1"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              setPageInput(String(currentPage));
            }}
            className="px-1.5 py-0.5 text-xs rounded hover:bg-accent transition-colors min-w-[4rem] text-center"
            title="Click to jump to page"
          >
            {currentPage} / {totalPages}
          </button>
        )}

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          title="Next page (→)"
          className="h-6 w-6"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>

        {!isMobile && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onPageChange(totalPages)}
            disabled={currentPage >= totalPages}
            title="Last page (End)"
            className="h-6 w-6"
          >
            <ChevronsRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Right: Zoom */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="tabular-nums">{zoom}%</span>
      </div>
    </div>
  );
}
