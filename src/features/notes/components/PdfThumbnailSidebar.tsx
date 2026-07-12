"use client";

import { useEffect, useRef } from "react";
import { Thumbnail } from "react-pdf";
import { cn } from "@/lib/utils";

export interface PdfThumbnailSidebarProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdfDocument: any;
  currentPage: number;
  totalPages: number;
  onPageSelect: (page: number) => void;
  collapsed: boolean;
}

function ThumbnailItem({
  pageNum,
  currentPage,
  pdfDocument,
  onPageSelect,
}: {
  pageNum: number;
  currentPage: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdfDocument: any;
  onPageSelect: (page: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      onClick={() => onPageSelect(pageNum)}
      className={cn(
        "cursor-pointer rounded-md overflow-hidden border-2 transition-all",
        "hover:border-primary/50 hover:shadow-sm",
        pageNum === currentPage
          ? "border-primary shadow-md ring-1 ring-primary/20"
          : "border-transparent"
      )}
    >
      <Thumbnail
        pdf={pdfDocument}
        pageNumber={pageNum}
        width={160}
        className="w-full"
        loading={
          <div className="w-full aspect-[0.707] bg-muted animate-pulse rounded" />
        }
      />
      <div
        className={cn(
          "text-center text-[10px] py-0.5",
          pageNum === currentPage
            ? "bg-primary text-primary-foreground font-medium"
            : "bg-muted/50 text-muted-foreground"
        )}
      >
        {pageNum}
      </div>
    </div>
  );
}

export function PdfThumbnailSidebar({
  pdfDocument,
  currentPage,
  totalPages,
  onPageSelect,
  collapsed,
}: PdfThumbnailSidebarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to current page thumbnail
  useEffect(() => {
    if (collapsed) return;
    const container = scrollRef.current;
    if (!container) return;
    const currentThumbnail = container.children[currentPage - 1] as HTMLElement;
    if (currentThumbnail) {
      const containerTop = container.scrollTop;
      const containerBottom = containerTop + container.clientHeight;
      const thumbnailTop = currentThumbnail.offsetTop;
      const thumbnailBottom = thumbnailTop + currentThumbnail.offsetHeight;

      if (thumbnailTop < containerTop || thumbnailBottom > containerBottom) {
        currentThumbnail.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }, [currentPage, collapsed]);

  if (collapsed) return null;

  return (
    <div className="w-[180px] shrink-0 border-r bg-background overflow-hidden flex flex-col">
      <div className="px-3 py-2 border-b">
        <span className="text-xs font-medium text-muted-foreground">
          Pages ({totalPages})
        </span>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-2 space-y-2"
        style={{ scrollbarWidth: "thin" }}
      >
        {pdfDocument &&
          Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
            <ThumbnailItem
              key={pageNum}
              pageNum={pageNum}
              currentPage={currentPage}
              pdfDocument={pdfDocument}
              onPageSelect={onPageSelect}
            />
          ))}
      </div>
    </div>
  );
}
