"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import {
  AlertCircle,
  ExternalLink,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  X,
} from "lucide-react";
import {
  configurePdfWorker,
  PDFJS_CMAP_URL,
  PDFJS_STANDARD_FONTS_URL,
} from "@/lib/pdf/setup";

interface MobilePdfViewerProps {
  fileUrl: string;
  fileKey: string;
  title: string;
  initialPage?: number;
  onClose: () => void;
  onRetry: () => void;
}

const WINDOW_RADIUS = 2; // render currentPage +/- 2 pages, release others

export function MobilePdfViewer({
  fileUrl,
  fileKey,
  title,
  initialPage = 1,
  onClose,
  onRetry,
}: MobilePdfViewerProps) {
  configurePdfWorker();

  const storageKey = `pdf:lastPage:${fileKey}`;
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState<number>(() => {
    if (typeof window === "undefined") return initialPage;
    const saved = Number(window.localStorage.getItem(storageKey));
    return Number.isFinite(saved) && saved >= 1 ? saved : initialPage;
  });
  const [jumpInput, setJumpInput] = useState(String(currentPage));
  const [scale, setScale] = useState(1);
  const [docError, setDocError] = useState(false);
  const [containerWidth, setContainerWidth] = useState(360);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const lastTapRef = useRef<number>(0);
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartScaleRef = useRef<number>(1);

  const documentOptions = useMemo(
    () => ({
      cMapUrl: PDFJS_CMAP_URL,
      cMapPacked: true,
      standardFontDataUrl: PDFJS_STANDARD_FONTS_URL,
    }),
    []
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      if (el.clientWidth > 0) setContainerWidth(el.clientWidth);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && currentPage >= 1) {
      window.localStorage.setItem(storageKey, String(currentPage));
      setJumpInput(String(currentPage));
    }
  }, [currentPage, storageKey]);

  // Track visible page on scroll
  function handleScroll() {
    const container = scrollRef.current;
    if (!container || numPages === 0) return;
    const midY = container.scrollTop + container.clientHeight / 3;
    let bestPage = currentPage;
    let bestDist = Infinity;
    pageRefs.current.forEach((el, pageNum) => {
      const dist = Math.abs(el.offsetTop - midY);
      if (dist < bestDist) {
        bestDist = dist;
        bestPage = pageNum;
      }
    });
    if (bestPage !== currentPage) {
      setCurrentPage(bestPage);
    }
  }

  function jumpToPage(target: number) {
    if (numPages === 0) return;
    const clamped = Math.max(1, Math.min(numPages, target));
    setCurrentPage(clamped);
    const el = pageRefs.current.get(clamped);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDistRef.current = Math.hypot(dx, dy);
      pinchStartScaleRef.current = scale;
      return;
    }
    if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTapRef.current < 280) {
        setScale((prev) => (prev > 1.15 ? 1 : 1.75));
      }
      lastTapRef.current = now;
    }
  }

  function handleTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (e.touches.length === 2 && pinchStartDistRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const next = pinchStartScaleRef.current * (dist / pinchStartDistRef.current);
      setScale(Math.max(0.75, Math.min(2.5, Number(next.toFixed(2)))));
    }
  }

  function handleTouchEnd() {
    pinchStartDistRef.current = null;
  }

  const pageWidth = Math.max(260, Math.floor((containerWidth - 24) * scale));
  const estHeight = Math.round(pageWidth * 1.35);

  return (
    <div
      className="flex flex-col h-dvh w-full bg-background"
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {/* Mobile PDF Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-card shrink-0">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close PDF viewer"
          className="p-2 rounded-md hover:bg-accent min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
        >
          <X className="h-5 w-5" />
        </button>
        <p className="text-sm font-medium text-foreground truncate flex-1">{title}</p>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(0.75, Number((s - 0.25).toFixed(2))))}
            aria-label="Zoom out"
            className="p-2 rounded-md hover:bg-accent min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(2.5, Number((s + 0.25).toFixed(2))))}
            aria-label="Zoom in"
            className="p-2 rounded-md hover:bg-accent min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Scrollable single-column pages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="flex-1 overflow-auto bg-muted/30 p-3 space-y-3"
      >
        {docError ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-base text-foreground">
                Can&apos;t open this file
              </h3>
              <p className="text-sm text-muted-foreground max-w-xs">
                Check your connection or open the PDF directly in your browser.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setDocError(false);
                  onRetry();
                }}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground min-h-[44px]"
              >
                <RotateCcw className="h-4 w-4" />
                Retry
              </button>
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground min-h-[44px]"
              >
                <ExternalLink className="h-4 w-4" />
                Open in browser
              </a>
            </div>
          </div>
        ) : (
          <Document
            file={fileUrl}
            options={documentOptions}
            onLoadSuccess={({ numPages: total }) => {
              setNumPages(total);
              setDocError(false);
              if (currentPage > 1 && currentPage <= total) {
                requestAnimationFrame(() => jumpToPage(currentPage));
              }
            }}
            onLoadError={() => setDocError(true)}
            loading={
              <div className="space-y-3">
                <div className="h-[60dvh] w-full rounded-lg bg-muted animate-pulse" />
                <div className="h-[60dvh] w-full rounded-lg bg-muted animate-pulse" />
              </div>
            }
          >
            {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => {
              const shouldRender = Math.abs(pageNum - currentPage) <= WINDOW_RADIUS;
              return (
                <div
                  key={pageNum}
                  ref={(el) => {
                    if (el) pageRefs.current.set(pageNum, el);
                    else pageRefs.current.delete(pageNum);
                  }}
                  className="flex justify-center"
                >
                  {shouldRender ? (
                    <div className="rounded shadow-sm overflow-hidden bg-card">
                      <Page
                        pageNumber={pageNum}
                        width={pageWidth}
                        renderAnnotationLayer={false}
                        renderTextLayer={false}
                        loading={
                          <div
                            style={{ width: pageWidth, height: estHeight }}
                            className="bg-muted animate-pulse rounded"
                          />
                        }
                      />
                    </div>
                  ) : (
                    <div
                      style={{ width: pageWidth, height: estHeight }}
                      className="rounded border border-border/40 bg-muted/40 flex items-center justify-center text-xs text-muted-foreground"
                    >
                      Page {pageNum}
                    </div>
                  )}
                </div>
              );
            })}
          </Document>
        )}
      </div>

      {/* Page indicator + jump to page */}
      {numPages > 0 && !docError && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const parsed = Number(jumpInput);
            if (Number.isFinite(parsed)) jumpToPage(parsed);
          }}
          className="flex items-center justify-center gap-2 px-3 py-2 border-t border-border bg-card text-xs shrink-0"
        >
          <span className="text-muted-foreground">Page</span>
          <input
            type="number"
            min={1}
            max={numPages}
            value={jumpInput}
            onChange={(e) => setJumpInput(e.target.value)}
            aria-label="Jump to page"
            className="w-16 rounded border border-border bg-background px-2 py-1 text-center text-sm min-h-[44px]"
          />
          <span className="text-muted-foreground">of {numPages}</span>
          <button
            type="submit"
            className="rounded border border-border px-3 py-1 font-medium text-foreground hover:bg-accent min-h-[44px]"
          >
            Go
          </button>
        </form>
      )}
    </div>
  );
}
