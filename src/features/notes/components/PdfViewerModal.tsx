"use client";

import { useState, useCallback, useMemo, useRef, useEffect, type TouchEvent as ReactTouchEvent } from "react";
import { Document, Page } from "react-pdf";

import {
  PdfLoader,
  PdfHighlighter,
  Highlight as LibHighlight,
  AreaHighlight,
  TextHighlight,
  usePdfHighlighterContext,
  useHighlightContainerContext,
  PdfSelection,
  ViewportPosition
} from "react-pdf-highlighter-extended";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PdfViewerToolbar } from "./PdfViewerToolbar";
import { PdfThumbnailSidebar } from "./PdfThumbnailSidebar";
import { PdfBottomBar } from "./PdfBottomBar";
import { PdfSearchBar } from "./PdfSearchBar";
import { AnnotationToolbar } from "./AnnotationToolbar";
import { AnnotationListSidebar } from "./AnnotationListSidebar";
import { TextSelectionFloatingBar } from "./TextSelectionFloatingBar";
import { configurePdfWorker } from "@/lib/pdf/setup";
import { useIsMobile } from "@/lib/use-is-mobile";
import { cn } from "@/lib/utils";
import { getPdfViewUrl } from "@/features/notes/lib/actions";
import { exportAnnotationsAsMarkdown, downloadMarkdown } from "@/features/notes/lib/annotation-utils";
import type { AnnotationTool } from "@/features/notes/lib/annotation-utils";
import type { NoteAnnotation } from "@prisma/client";
import { createAnnotation, updateAnnotation, deleteAnnotation } from "@/features/notes/lib/actions-annotations";
import { AlertCircle, Loader2, Download, HardDriveDownload, Check } from "lucide-react";
import { toast } from "sonner";
import {
  isDocumentCached,
  saveDocumentOffline,
  removeDocumentOffline,
  getCachedDocumentBlobUrl,
} from "@/lib/pdf/offline-cache";

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
const TOOLBAR_HIDE_DELAY = 3000;

// Inner highlight container for react-pdf-highlighter-extended
function HighlightContainer({ 
  onEdit, 
  onDelete 
}: { 
  onEdit: (id: string, data: any) => void;
  onDelete: (id: string) => void;
}) {
  const { highlight, isScrolledTo } = useHighlightContainerContext<any>();
  const isTextHighlight = highlight.type !== "area";
  
  if (isTextHighlight) {
    return (
      <TextHighlight 
        isScrolledTo={isScrolledTo} 
        highlight={highlight as any} 
        style={{ 
          background: highlight.type === "UNDERLINE" ? "transparent" : highlight.color,
          borderBottom: highlight.type === "UNDERLINE" ? `2px solid ${highlight.color}` : "none",
          opacity: 0.5 
        }} 
      />
    );
  }
  
  return (
    <AreaHighlight
      isScrolledTo={isScrolledTo}
      highlight={highlight as any}
      onChange={() => {}}
      bounds={document.body}
    />
  );
}

function DocumentLoadedHandler({ 
  pdfDocument, 
  onLoadSuccess 
}: { 
  pdfDocument: any; 
  onLoadSuccess: (pdf: any) => void; 
}) {
  useEffect(() => {
    onLoadSuccess(pdfDocument);
  }, [pdfDocument, onLoadSuccess]);
  return null;
}

export function PdfViewerModal({
  open,
  onOpenChange,
  noteId,
  attachmentId,
  s3Key,
  s3Url: _s3Url,
  title,
  initialPage = 1,
  annotations = [],
}: PdfViewerModalProps) {
  const isMobile = useIsMobile();
  const containerRef = useRef<HTMLDivElement>(null);
  const toolbarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const [toolbarHovered, setToolbarHovered] = useState(false);

  const [pdfDocument, setPdfDocument] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [viewMode, setViewMode] = useState<"single" | "continuous">("continuous");
  const [showSidebar, setShowSidebar] = useState(!isMobile);
  const [showSearch, setShowSearch] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [isOfflineSaved, setIsOfflineSaved] = useState(false);
  const [isOfflineCopy, setIsOfflineCopy] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  // Annotation system state
  const [activeTool, setActiveTool] = useState<AnnotationTool | null>(null);
  const [activeColor, setActiveColor] = useState("#FFD700");
  const [showAnnotationToolbar, setShowAnnotationToolbar] = useState(true);
  const [showAnnotationSidebar, setShowAnnotationSidebar] = useState(false);
  const [localAnnotations, setLocalAnnotations] = useState<NoteAnnotation[]>([]);

  // Selection Tip State
  const [currentSelection, setCurrentSelection] = useState<PdfSelection | null>(null);

  useEffect(() => {
    if (open) {
      setLocalAnnotations(annotations);
    }
  }, [open, annotations]);

  useEffect(() => {
    configurePdfWorker();
  }, []);

  useEffect(() => {
    if (open && noteId) {
      isDocumentCached(noteId).then(setIsOfflineSaved);
    }
  }, [open, noteId]);

  const loadUrl = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const result = await getPdfViewUrl(noteId, attachmentId, s3Key);
      if (result.ok) {
        setViewUrl(result.data.url);
        setIsOfflineCopy(false);
        setIsLoading(false);
        return;
      }
    } catch {
      // Ignore network error and attempt offline fallback
    }

    const cachedUrl = await getCachedDocumentBlobUrl(noteId);
    if (cachedUrl) {
      setViewUrl(cachedUrl);
      setIsOfflineCopy(true);
      setIsLoading(false);
    } else {
      setError("Files unavailable, storage is offline");
      setIsLoading(false);
    }
  }, [noteId, attachmentId, s3Key]);

  useEffect(() => {
    if (!open) {
      setPdfDocument(null);
      setTotalPages(0);
      setViewUrl(null);
      return;
    }
    loadUrl();
  }, [open, loadUrl]);

  const handleToggleOffline = async () => {
    if (isOfflineSaved) {
      await removeDocumentOffline(noteId);
      setIsOfflineSaved(false);
      toast.success("Removed from offline storage");
    } else if (viewUrl) {
      const res = await saveDocumentOffline(noteId, viewUrl);
      if (res.ok) {
        setIsOfflineSaved(true);
        toast.success("Document kept offline");
      } else {
        toast.error(res.error || "Failed to save offline");
      }
    }
  };

  const handleDocumentLoadSuccess = useCallback((pdf: any) => {
    setTotalPages(pdf.numPages);
    setPdfDocument(pdf);
    setIsLoading(false);
    setError(null);
  }, []);

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  }, [totalPages]);

  const handleZoomIn = useCallback(() => setZoom(z => Math.min(300, z + 25)), []);
  const handleZoomOut = useCallback(() => setZoom(z => Math.max(25, z - 25)), []);
  const handleZoomReset = useCallback(() => setZoom(100), []);
  const handleZoomChange = useCallback((newZoom: number) => setZoom(Math.max(25, Math.min(300, newZoom))), []);
  const [containerWidth, setContainerWidth] = useState<number>(0);

  // Pinch-to-zoom state
  const pinchStartDistRef = useRef<number>(0);
  const pinchStartZoomRef = useRef<number>(100);
  const isPinchingRef = useRef<boolean>(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Pinch-to-zoom touch handlers
  const getTouchDistance = useCallback((touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      isPinchingRef.current = true;
      pinchStartDistRef.current = getTouchDistance(e.touches);
      pinchStartZoomRef.current = zoom;
    }
  }, [zoom, getTouchDistance]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && isPinchingRef.current) {
      e.preventDefault();
      const currentDist = getTouchDistance(e.touches);
      if (pinchStartDistRef.current > 0) {
        const scale = currentDist / pinchStartDistRef.current;
        const newZoom = Math.round(pinchStartZoomRef.current * scale);
        handleZoomChange(newZoom);
      }
    }
  }, [getTouchDistance, handleZoomChange]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      isPinchingRef.current = false;
    }
  }, []);

  const handleClose = useCallback(() => onOpenChange(false), [onOpenChange]);

  const handleDownload = useCallback(() => {
    if (!viewUrl) return;
    const a = document.createElement("a");
    a.href = viewUrl;
    a.download = title || "document.pdf";
    a.click();
  }, [viewUrl, title]);

  const handleSaveAnnotation = async (type: string, color: string) => {
    if (!currentSelection) return;
    
    const ghost = currentSelection.makeGhostHighlight();
    const position = ghost.position;
    const text = ghost.content.text;

    const optimistic: NoteAnnotation = {
      id: "temp-" + Date.now(),
      noteId,
      fileAttachmentId: null,
      userId: "me",
      type,
      pageNumber: position.boundingRect.pageNumber,
      position: position as any,
      text: text || null,
      color,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    setLocalAnnotations(prev => [...prev, optimistic]);
    setCurrentSelection(null);

    const res = await createAnnotation(noteId, {
      type,
      pageNumber: position.boundingRect.pageNumber,
      position,
      text: text || "",
      color,
    });

    if (!res.ok) {
      console.error("Failed to save annotation:", res.error);
      toast.error("Failed to save annotation: " + res.error);
      setLocalAnnotations(prev => prev.filter(a => a.id !== optimistic.id));
    } else {
      setLocalAnnotations(prev => prev.map(a => a.id === optimistic.id ? { ...a, id: res.data.id } : a));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-[95vw] sm:max-w-[95vw] w-full h-[95vh] p-0 flex flex-col overflow-hidden shadow-2xl rounded-xl border-border/50 bg-background/95 backdrop-blur-sm sm:rounded-xl" showCloseButton={false}>
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
          onZoomChange={handleZoomChange}
          onFitWidth={() => {}}
          onFitPage={() => {}}
          onViewModeChange={setViewMode}
          onToggleSidebar={() => setShowSidebar(v => !v)}
          onToggleSearch={() => setShowSearch(v => !v)}
          onToggleInfo={() => setShowInfo(v => !v)}
          onToggleFullscreen={() => {}}
          onToggleAnnotationSidebar={() => setShowAnnotationSidebar(v => !v)}
          showAnnotationSidebar={showAnnotationSidebar}
          onDownload={handleDownload}
          isOfflineSaved={isOfflineSaved}
          isOfflineCopy={isOfflineCopy}
          onToggleOffline={handleToggleOffline}
        />

        <div className="flex flex-1 min-h-0 overflow-hidden relative">
          {!isMobile && (
             <div className="hidden lg:block w-[180px] shrink-0 border-r bg-background overflow-hidden flex flex-col">
                 <div className="px-3 py-2 border-b">
                   <span className="text-xs font-medium text-muted-foreground">Pages ({totalPages})</span>
                 </div>
                 <div className="flex-1 overflow-y-auto p-2" style={{ scrollbarWidth: "thin" }}>
                   {viewUrl && (
                     <Document file={viewUrl} onLoadSuccess={(p) => handleDocumentLoadSuccess(p)}>
                       {Array.from({ length: totalPages }, (_, i) => i + 1).map((num) => (
                         <div 
                            key={num} 
                            onClick={() => handlePageChange(num)}
                            className={cn("mb-2 p-1 border-2 rounded cursor-pointer", num === currentPage ? "border-primary" : "border-transparent hover:border-border")}
                         >
                            <Page pageNumber={num} width={150} renderAnnotationLayer={false} renderTextLayer={false} />
                            <div className="text-center text-[10px] mt-1">{num}</div>
                         </div>
                       ))}
                     </Document>
                   )}
                 </div>
             </div>
          )}

          <div
            ref={containerRef}
            className="flex-1 relative overflow-auto bg-muted/30"
            style={{ touchAction: isMobile ? "pan-x pan-y" : undefined }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {isLoading && (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}

            {error && (
              <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-semibold text-base">Files unavailable, storage is offline</h3>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Cannot connect to storage server. Please verify your connection or retry.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => loadUrl()}
                  className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                >
                  Retry
                </button>
              </div>
            )}

            {viewUrl && (
              <PdfLoader 
                document={viewUrl}
                workerSrc="https://unpkg.com/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs"
              >
                {(pdfDocument) => {
                  // Base scale: assuming average page width of 612 (8.5 inches * 72)
                  // We subtract 64px for padding
                  const baseScale = containerWidth > 0 ? (containerWidth - 64) / 612 : 1.2;
                  // If zoom is 100%, we fit to container. Otherwise we scale relative to that.
                  const computedScale = zoom === 100 ? "page-width" : baseScale * (zoom / 100);

                  return (
                    <>
                      {pdfDocument.numPages !== totalPages && (
                        <DocumentLoadedHandler 
                          pdfDocument={pdfDocument} 
                          onLoadSuccess={handleDocumentLoadSuccess} 
                        />
                      )}
                      <PdfHighlighter
                        pdfDocument={pdfDocument}
                      enableAreaSelection={(event) => event.altKey}
                      pdfScaleValue={computedScale}
                      utilsRef={() => {}}
                      onSelection={(selection) => setCurrentSelection(selection)}
                      selectionTip={
                        currentSelection ? (
                          <div className="flex gap-1 p-1 bg-popover border shadow-lg rounded-md z-50">
                            <TextSelectionFloatingBar 
                              visible={true}
                              selectedText="selection"
                              activeColor={activeColor}
                              position={{ x: 0, y: 0 }}
                              inline={true}
                              onHighlight={() => handleSaveAnnotation("HIGHLIGHT", activeColor)}
                              onUnderline={() => handleSaveAnnotation("UNDERLINE", activeColor)}
                              onAddNote={() => handleSaveAnnotation("NOTE", activeColor)}
                              onCopy={() => {
                                navigator.clipboard.writeText(currentSelection.makeGhostHighlight().content.text || "");
                                toast.success("Copied to clipboard");
                                setCurrentSelection(null);
                              }}
                              onClose={() => setCurrentSelection(null)}
                            />
                          </div>
                        ) : undefined
                      }
                      highlights={localAnnotations as any}
                    >
                      <HighlightContainer onEdit={() => {}} onDelete={() => {}} />
                    </PdfHighlighter>
                    </>
                  );
                }}
              </PdfLoader>
            )}
          </div>
        </div>

        <PdfBottomBar
          currentPage={currentPage}
          totalPages={totalPages}
          zoom={zoom}
          onPageChange={handlePageChange}
          onZoomChange={handleZoomChange}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          isMobile={isMobile}
        />
        
        <AnnotationToolbar
            activeTool={activeTool}
            activeColor={activeColor}
            onToolChange={setActiveTool}
            onColorChange={setActiveColor}
            onExport={() => {}}
            visible={showAnnotationToolbar}
          />
      </DialogContent>
    </Dialog>
  );
}
