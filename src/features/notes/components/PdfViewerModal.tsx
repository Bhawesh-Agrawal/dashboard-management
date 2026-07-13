"use client";

import { useState, useCallback, useMemo, useRef, useEffect, type TouchEvent as ReactTouchEvent } from "react";
import { Document, Page } from "react-pdf";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PdfViewerToolbar } from "./PdfViewerToolbar";
import { PdfThumbnailSidebar } from "./PdfThumbnailSidebar";
import { PdfBottomBar } from "./PdfBottomBar";
import { PdfSearchBar } from "./PdfSearchBar";
import { PdfAnnotationOverlay } from "./PdfAnnotationOverlay";
import { configurePdfWorker } from "@/lib/pdf/setup";
import { useIsMobile } from "@/lib/use-is-mobile";
import { cn } from "@/lib/utils";
import { getPdfViewUrl } from "@/features/notes/lib/actions";
import type { NoteAnnotation } from "@prisma/client";
import {
  AlertCircle,
  Loader2,
} from "lucide-react";

export interface PdfViewerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteId: string;
  attachmentId?: string;
  s3Key?: string;
  s3Url: string;
  title: string;
  initialPage?: number;
  annotations?: NoteAnnotation[];
}

const ZOOM_PRESETS = [25, 50, 75, 100, 125, 150, 200] as const;
const LAZY_BUFFER = 3;
const SWIPE_THRESHOLD = 50;
const TOOLBAR_HIDE_DELAY = 3000;

export function PdfViewerModal({
  open,
  onOpenChange,
  noteId,
  attachmentId,
  s3Key,
  s3Url: _s3Url, // eslint-disable-line @typescript-eslint/no-unused-vars
  title,
  initialPage = 1,
  annotations = [],
}: PdfViewerModalProps) {
  const isMobile = useIsMobile();
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const toolbarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const [toolbarHovered, setToolbarHovered] = useState(false);

  const [pdfDocument, setPdfDocument] = useState<Record<string, unknown> | null>(null);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [viewMode, setViewMode] = useState<"single" | "continuous">("single");
  const [showSidebar, setShowSidebar] = useState(!isMobile);
  const [showSearch, setShowSearch] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    { pageNumber: number; matchIndex: number }[]
  >([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [highlightAll, setHighlightAll] = useState(true);

  // Pinch-to-zoom state for custom two-finger handler
  const pinchStartRef = useRef<{ distance: number; zoom: number } | null>(null);

  // Configure worker on mount
  useEffect(() => {
    configurePdfWorker();
  }, []);

  // Fetch presigned GET URL when modal opens, then reset state
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) {
      setPdfDocument(null);
      setTotalPages(0);
      setViewUrl(null);
      return;
    }

    setCurrentPage(initialPage);
    setZoom(100);
    setViewMode(isMobile ? "continuous" : "single");
    setError(null);
    setIsLoading(true);
    setShowSearch(false);
    setShowInfo(false);
    setSearchQuery("");
    setSearchResults([]);
    if (isMobile) setShowSidebar(false);

    let cancelled = false;
    getPdfViewUrl(noteId, attachmentId, s3Key).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setViewUrl(result.data.url);
      } else {
        setError(result.error);
        setIsLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [open, noteId, attachmentId, s3Key, initialPage, isMobile]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Sync initial page when pdf loads
  useEffect(() => {
    if (pdfDocument && initialPage > 1 && initialPage <= totalPages) {
      setCurrentPage(initialPage); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [pdfDocument, initialPage, totalPages]);

  const handleDocumentLoadSuccess = useCallback(
    ({ numPages }: { numPages: number }) => {
      setTotalPages(numPages);
      setIsLoading(false);
      setError(null);
      if (pdfDocument) {
        setCurrentPage(Math.min(initialPage, numPages));
      }
      // Auto-fit-width on mobile after load
      if (isMobile && containerRef.current) {
        requestAnimationFrame(() => {
          const containerWidth = containerRef.current?.clientWidth || 0;
          if (containerWidth > 0) {
            const pageWidthInches = 8.27;
            const fitZoom = Math.round((containerWidth / (pageWidthInches * 96)) * 100);
            setZoom(Math.max(25, Math.min(200, fitZoom)));
          }
        });
      }
    },
    [initialPage, pdfDocument, isMobile]
  );

  const handleDocumentLoadError = useCallback((err: Error) => {
    setIsLoading(false);
    setError(err.message || "Failed to load PDF");
  }, []);

  const handlePageChange = useCallback(
    (page: number) => {
      const clamped = Math.max(1, Math.min(page, totalPages));
      setCurrentPage(clamped);
    },
    [totalPages]
  );

  const handleZoomChange = useCallback((newZoom: number) => {
    setZoom(Math.max(25, Math.min(200, newZoom)));
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => {
      const nextIdx = ZOOM_PRESETS.findIndex((z) => z > prev);
      return nextIdx >= 0 ? ZOOM_PRESETS[nextIdx] : 200;
    });
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => {
      const nextIdx = [...ZOOM_PRESETS].reverse().findIndex((z) => z < prev);
      return nextIdx >= 0 ? ZOOM_PRESETS[ZOOM_PRESETS.length - 1 - nextIdx] : 25;
    });
  }, []);

  const handleZoomReset = useCallback(() => setZoom(100), []);

  const handleFitWidth = useCallback(() => {
    if (!containerRef.current) return;
    const containerWidth = containerRef.current.clientWidth - (showSidebar && !isMobile ? 180 : 0);
    // Assume standard A4 width ~8.27 inches, 96 DPI
    const pageWidthInches = 8.27;
    const fitZoom = Math.round((containerWidth / (pageWidthInches * 96)) * 100);
    setZoom(Math.max(25, Math.min(200, fitZoom)));
  }, [showSidebar, isMobile]);

  const handleFitPage = useCallback(() => {
    if (!containerRef.current) return;
    const containerHeight = containerRef.current.clientHeight - 96; // toolbar + bottom bar
    const containerWidth = containerRef.current.clientWidth - (showSidebar && !isMobile ? 180 : 0);
    // Assume A4 ratio
    const pageRatio = 1.414; // height/width
    const fitByWidth = containerWidth / 8.27 / 96 * 100;
    const fitByHeight = containerHeight / (8.27 * pageRatio) / 96 * 100;
    setZoom(Math.max(25, Math.min(200, Math.round(Math.min(fitByWidth, fitByHeight)))));
  }, [showSidebar, isMobile]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      // Fullscreen not supported or blocked
    }
  }, []);

  const handleClose = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().then(() => onOpenChange(false));
    } else {
      onOpenChange(false);
    }
  }, [onOpenChange]);

  const handleDownload = useCallback(() => {
    if (!viewUrl) return;
    const a = document.createElement("a");
    a.href = viewUrl;
    a.download = title || "document.pdf";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [viewUrl, title]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return;

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        handlePageChange(currentPage - 1);
        return;
      }
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        handlePageChange(currentPage + 1);
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        handlePageChange(1);
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        handlePageChange(totalPages);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setShowSearch(true);
        return;
      }
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        handleZoomIn();
        return;
      }
      if (e.key === "-") {
        e.preventDefault();
        handleZoomOut();
        return;
      }
      if (e.key === "0") {
        e.preventDefault();
        handleZoomReset();
        return;
      }
      if (e.key === "f" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        toggleFullscreen();
        return;
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [
    open,
    currentPage,
    totalPages,
    handleClose,
    handlePageChange,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
    toggleFullscreen,
  ]);

  const scale = zoom / 100;

  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const pageWidth = useMemo(() => {
    if (containerWidth === 0) return undefined;
    const sidebarWidth = showSidebar && !isMobile ? 180 : 0;
    const available = containerWidth - sidebarWidth - (isMobile ? 8 : 32);
    return Math.min(available * scale, isMobile ? 2000 : 1200);
  }, [containerWidth, showSidebar, isMobile, scale]);

  const pageAnnotations = useMemo(() => {
    return annotations.filter((a) => a.pageNumber === currentPage);
  }, [annotations, currentPage]);

  // Toolbar auto-hide on mobile (3s inactivity)
  const resetToolbarTimer = useCallback(() => {
    setToolbarVisible(true);
    if (toolbarTimerRef.current) clearTimeout(toolbarTimerRef.current);
    if (isMobile && !toolbarHovered) {
      toolbarTimerRef.current = setTimeout(() => setToolbarVisible(false), TOOLBAR_HIDE_DELAY);
    }
  }, [isMobile, toolbarHovered]);

  useEffect(() => {
    if (isMobile && open) {
      toolbarTimerRef.current = setTimeout(() => setToolbarVisible(false), TOOLBAR_HIDE_DELAY);
    }
    return () => { if (toolbarTimerRef.current) clearTimeout(toolbarTimerRef.current); };
  }, [isMobile, open]);

  // IntersectionObserver for continuous mode page tracking
  useEffect(() => {
    if (viewMode !== "continuous" || !scrollContainerRef.current || totalPages === 0) return;

    const container = scrollContainerRef.current;
    const pageElements = container.querySelectorAll<HTMLElement>("[data-page-number]");

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => {
            const aNum = Number((a.target as HTMLElement).dataset.pageNumber) || 0;
            const bNum = Number((b.target as HTMLElement).dataset.pageNumber) || 0;
            return aNum - bNum;
          });
        if (visible.length > 0) {
          const pageNum = Number((visible[0].target as HTMLElement).dataset.pageNumber);
          if (pageNum >= 1 && pageNum <= totalPages) {
            setCurrentPage(pageNum);
          }
        }
      },
      { root: container, rootMargin: "0px 0px -20% 0px", threshold: 0.1 }
    );

    pageElements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [viewMode, totalPages, pdfDocument]);

  // Scroll to page in single mode or when page changes programmatically
  useEffect(() => {
    if (viewMode !== "continuous" && scrollContainerRef.current) {
      const el = scrollContainerRef.current.querySelector<HTMLElement>(`[data-page-number="${currentPage}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [currentPage, viewMode]);

  // Swipe gestures (single mode, mobile)
  const handleTouchStart = useCallback((e: ReactTouchEvent) => {
    if (viewMode !== "single") return;
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  }, [viewMode]);

  const handleTouchEnd = useCallback((e: ReactTouchEvent) => {
    if (viewMode !== "single" || !touchStartRef.current) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    const dt = Date.now() - touchStartRef.current.time;
    touchStartRef.current = null;

    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.5 && dt < 500) {
      if (dx < 0) handlePageChange(currentPage + 1);
      else handlePageChange(currentPage - 1);
    }
  }, [viewMode, currentPage, handlePageChange]);

  // Custom two-finger pinch-to-zoom (works on both iOS and Android)
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || !isMobile) return;

    const getDistance = (touches: TouchList) => {
      const t1 = touches[0];
      const t2 = touches[1];
      return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        pinchStartRef.current = {
          distance: getDistance(e.touches),
          zoom: zoom,
        };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchStartRef.current) {
        e.preventDefault();
        const currentDistance = getDistance(e.touches);
        const scale = currentDistance / pinchStartRef.current.distance;
        const newZoom = Math.round(pinchStartRef.current.zoom * scale);
        setZoom(Math.max(25, Math.min(200, newZoom)));
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        pinchStartRef.current = null;
      }
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: false });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isMobile, zoom]);

  // Lazy page rendering: in continuous mode, only render pages within ±LAZY_BUFFER of current
  const isLazyPage = useCallback(
    (pageNum: number) => viewMode === "continuous" && Math.abs(pageNum - currentPage) > LAZY_BUFFER,
    [viewMode, currentPage]
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent
        className={cn(
          "sm:max-w-none sm:max-h-none w-full h-full rounded-none p-0",
          "bg-background text-foreground",
          "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
          "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          "duration-200"
        )}
        showCloseButton={false}
      >
        <div
          ref={containerRef}
          className="flex flex-col h-full w-full overflow-hidden"
          onMouseMove={isMobile ? resetToolbarTimer : undefined}
          onTouchStart={isMobile ? resetToolbarTimer : undefined}
        >
          {/* Top toolbar */}
          <div
            className={cn(
              "transition-opacity duration-300",
              isMobile && !toolbarVisible && !toolbarHovered && "opacity-0 pointer-events-none"
            )}
            onMouseEnter={isMobile ? () => setToolbarHovered(true) : undefined}
            onMouseLeave={isMobile ? () => setToolbarHovered(false) : undefined}
          >
            <PdfViewerToolbar
              title={title}
              currentPage={currentPage}
              totalPages={totalPages}
              zoom={zoom}
              viewMode={viewMode}
              showSidebar={showSidebar}
              showSearch={showSearch}
              showInfo={showInfo}
              isFullscreen={isFullscreen}
              onBack={handleClose}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onZoomReset={handleZoomReset}
              onFitWidth={handleFitWidth}
              onFitPage={handleFitPage}
              onViewModeChange={setViewMode}
              onToggleSidebar={() => setShowSidebar((v) => !v)}
              onToggleSearch={() => setShowSearch((v) => !v)}
              onToggleInfo={() => setShowInfo((v) => !v)}
              onToggleFullscreen={toggleFullscreen}
              onDownload={handleDownload}
            />
          </div>

          {/* Main content area */}
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Thumbnail sidebar */}
            {!isMobile && (
              <PdfThumbnailSidebar
                pdfDocument={pdfDocument}
                currentPage={currentPage}
                totalPages={totalPages}
                onPageSelect={handlePageChange}
                collapsed={!showSidebar}
              />
            )}

            {/* PDF rendering area */}
            <div
              ref={scrollContainerRef}
              className="flex-1 overflow-auto bg-muted/30 flex justify-center touch-pan-y pdf-scroll-container"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              onScroll={isMobile ? resetToolbarTimer : undefined}
            >
              {isLoading && (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Loading PDF...</p>
                </div>
              )}

              {error && (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <AlertCircle className="h-8 w-8 text-destructive" />
                  <p className="text-sm text-destructive font-medium">Unable to load PDF</p>
                  <p className="text-xs text-muted-foreground">{error}</p>
                </div>
              )}

              {viewUrl && (
              <Document
                file={viewUrl}
                onLoadSuccess={handleDocumentLoadSuccess}
                onLoadError={handleDocumentLoadError}
                loading={null}
                error={null}
                noData={null}
                className={cn(
                  "pdf-document",
                  "dark:pdf-dark-mode"
                )}
              >
                {viewMode === "single" ? (
                  <div className="relative py-4">
                    <div className="relative" data-page-number={currentPage}>
                      <Page
                        pageNumber={currentPage}
                        scale={scale}
                        width={pageWidth}
                        renderTextLayer={true}
                        renderAnnotationLayer={false}
                        className="shadow-lg"
                      />
                      <PdfAnnotationOverlay
                        annotations={pageAnnotations}
                        pageNumber={currentPage}
                        scale={scale}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4 py-4">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                      (num) => (
                        <div key={num} className="relative" data-page-number={num}>
                          {isLazyPage(num) ? (
                            <div
                              style={{ width: pageWidth, height: pageWidth ? pageWidth * 1.414 : 800 }}
                              className="bg-muted animate-pulse rounded"
                            />
                          ) : (
                            <>
                              <Page
                                pageNumber={num}
                                scale={scale}
                                width={pageWidth}
                                renderTextLayer={true}
                                renderAnnotationLayer={false}
                                className={cn(
                                  "shadow-lg",
                                  num === currentPage && "ring-2 ring-primary"
                                )}
                              />
                              <PdfAnnotationOverlay
                                annotations={annotations.filter(
                                  (a) => a.pageNumber === num
                                )}
                                pageNumber={num}
                                scale={scale}
                              />
                            </>
                          )}
                        </div>
                      )
                    )}
                  </div>
                )}
              </Document>
              )}
            </div>
          </div>

          {/* Bottom bar */}
          <div
            className={cn(
              "transition-opacity duration-300",
              isMobile && !toolbarVisible && !toolbarHovered && "opacity-0 pointer-events-none"
            )}
          >
            <PdfBottomBar
              currentPage={currentPage}
              totalPages={totalPages}
              zoom={zoom}
              onPageChange={handlePageChange}
              onZoomChange={handleZoomChange}
              isMobile={isMobile}
            />
          </div>

          {/* Search overlay */}
          {showSearch && (
            <PdfSearchBar
              query={searchQuery}
              onQueryChange={setSearchQuery}
              results={searchResults}
              currentMatchIndex={currentMatchIndex}
              onResultNavigate={setCurrentMatchIndex}
              highlightAll={highlightAll}
              onToggleHighlightAll={() => setHighlightAll((v) => !v)}
              onClose={() => setShowSearch(false)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
