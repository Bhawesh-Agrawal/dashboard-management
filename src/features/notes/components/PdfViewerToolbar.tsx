"use client";

import {
  ArrowLeft,
  Search,
  Info,
  Maximize,
  Minimize,
  Download,
  PanelLeftClose,
  PanelLeft,
  ZoomIn,
  ZoomOut,
  Rows3,
  FileText,
  ChevronDown,
  Menu,
  PenTool,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useState, useRef, useEffect } from "react";

const ZOOM_PRESETS = [25, 50, 75, 100, 125, 150, 200] as const;

export interface PdfViewerToolbarProps {
  title: string;
  currentPage: number;
  totalPages: number;
  zoom: number;
  viewMode: "single" | "continuous";
  showSidebar: boolean;
  showSearch: boolean;
  showInfo: boolean;
  isFullscreen: boolean;
  showAnnotationSidebar: boolean;
  onBack: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onFitWidth: () => void;
  onFitPage: () => void;
  onViewModeChange: (mode: "single" | "continuous") => void;
  onToggleSidebar: () => void;
  onToggleSearch: () => void;
  onToggleInfo: () => void;
  onToggleFullscreen: () => void;
  onToggleAnnotationSidebar: () => void;
  onDownload: () => void;
}

export function PdfViewerToolbar({
  title,
  zoom,
  viewMode,
  showSidebar,
  isFullscreen,
  showAnnotationSidebar,
  onBack,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onFitWidth,
  onFitPage,
  onViewModeChange,
  onToggleSidebar,
  onToggleSearch,
  onToggleInfo,
  onToggleFullscreen,
  onToggleAnnotationSidebar,
  onDownload,
}: PdfViewerToolbarProps) {
  const [showZoomMenu, setShowZoomMenu] = useState(false);
  const [showOverflow, setShowOverflow] = useState(false);
  const zoomMenuRef = useRef<HTMLDivElement>(null);
  const overflowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (zoomMenuRef.current && !zoomMenuRef.current.contains(e.target as Node)) {
        setShowZoomMenu(false);
      }
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setShowOverflow(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="sticky top-0 z-30 flex items-center h-12 px-2 gap-1 border-b bg-background/95 backdrop-blur-sm shrink-0" style={{ paddingTop: "max(0px, env(safe-area-inset-top, 0px))" }}>
      {/* Left: Back + Title */}
      <div className="flex items-center gap-1 min-w-0 flex-1">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onBack}
          className="shrink-0 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
          title="Back to Notes (Esc)"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <button
          type="button"
          onClick={onToggleSidebar}
          className="shrink-0 p-2 sm:p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
          title={showSidebar ? "Hide sidebar" : "Show sidebar"}
        >
          {showSidebar ? (
            <PanelLeftClose className="h-4 w-4" />
          ) : (
            <PanelLeft className="h-4 w-4" />
          )}
        </button>

        <h2 className="text-sm font-medium truncate">{title}</h2>
      </div>

      {/* Center: Zoom controls (desktop) */}
      <div className="hidden md:flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onZoomOut}
          title="Zoom out (-)"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>

        <div className="relative" ref={zoomMenuRef}>
          <button
            type="button"
            onClick={() => setShowZoomMenu((v) => !v)}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors min-w-[4rem] justify-center"
          >
            {zoom}%
            <ChevronDown className="h-3 w-3" />
          </button>

          {showZoomMenu && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-popover border rounded-lg shadow-lg py-1 z-50 min-w-[140px]">
              {ZOOM_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    onZoomReset();
                    setShowZoomMenu(false);
                  }}
                  className={cn(
                    "w-full px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors",
                    zoom === preset && "font-medium text-foreground"
                  )}
                >
                  {preset}%
                </button>
              ))}
              <div className="border-t my-1" />
              <button
                type="button"
                onClick={() => {
                  onFitWidth();
                  setShowZoomMenu(false);
                }}
                className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors"
              >
                Fit to width
              </button>
              <button
                type="button"
                onClick={() => {
                  onFitPage();
                  setShowZoomMenu(false);
                }}
                className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors"
              >
                Fit to page
              </button>
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onZoomIn}
          title="Zoom in (+)"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>

        <div className="w-px h-4 bg-border mx-1" />

        <Button
          variant={viewMode === "single" ? "secondary" : "ghost"}
          size="icon-sm"
          onClick={() => onViewModeChange("single")}
          title="Single page"
        >
          <FileText className="h-4 w-4" />
        </Button>

        <Button
          variant={viewMode === "continuous" ? "secondary" : "ghost"}
          size="icon-sm"
          onClick={() => onViewModeChange("continuous")}
          title="Continuous scroll"
        >
          <Rows3 className="h-4 w-4" />
        </Button>
      </div>

      {/* Right: Actions (desktop) */}
      <div className="hidden md:flex items-center gap-1 flex-1 justify-end">
        <Button
          variant={showAnnotationSidebar ? "secondary" : "ghost"}
          size="icon-sm"
          onClick={onToggleAnnotationSidebar}
          title="Toggle annotations (S)"
        >
          <PenTool className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggleSearch}
          title="Search (Ctrl+F)"
        >
          <Search className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggleInfo}
          title="Document info"
        >
          <Info className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggleFullscreen}
          title="Fullscreen (F)"
        >
          {isFullscreen ? (
            <Minimize className="h-4 w-4" />
          ) : (
            <Maximize className="h-4 w-4" />
          )}
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDownload}
          title="Download"
        >
          <Download className="h-4 w-4" />
        </Button>
      </div>

      {/* Mobile: Overflow menu */}
      <div className="md:hidden relative" ref={overflowRef}>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setShowOverflow((v) => !v)}
          className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
        >
          <Menu className="h-5 w-5" />
        </Button>

        {showOverflow && (
          <div className="absolute top-full right-0 mt-1 bg-popover border rounded-lg shadow-lg py-1 z-50 min-w-[180px]">
            <button
              type="button"
              onClick={() => {
                onZoomOut();
                setShowOverflow(false);
              }}
              className="w-full px-3 py-2.5 sm:py-2 text-sm text-left hover:bg-accent flex items-center gap-2 min-h-[44px] sm:min-h-0"
            >
              <ZoomOut className="h-4 w-4" /> Zoom out
            </button>
            <button
              type="button"
              onClick={() => {
                onZoomIn();
                setShowOverflow(false);
              }}
              className="w-full px-3 py-2.5 sm:py-2 text-sm text-left hover:bg-accent flex items-center gap-2 min-h-[44px] sm:min-h-0"
            >
              <ZoomIn className="h-4 w-4" /> Zoom in
            </button>
            <button
              type="button"
              onClick={() => {
                onViewModeChange(viewMode === "single" ? "continuous" : "single");
                setShowOverflow(false);
              }}
              className="w-full px-3 py-2.5 sm:py-2 text-sm text-left hover:bg-accent flex items-center gap-2 min-h-[44px] sm:min-h-0"
            >
              {viewMode === "single" ? (
                <>
                  <Rows3 className="h-4 w-4" /> Continuous scroll
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4" /> Single page
                </>
              )}
            </button>
            <div className="border-t my-1" />
            <button
              type="button"
              onClick={() => {
                onToggleAnnotationSidebar();
                setShowOverflow(false);
              }}
              className="w-full px-3 py-2.5 sm:py-2 text-sm text-left hover:bg-accent flex items-center gap-2 min-h-[44px] sm:min-h-0"
            >
              <PenTool className="h-4 w-4" /> Annotations
            </button>
            <button
              type="button"
              onClick={() => {
                onToggleSearch();
                setShowOverflow(false);
              }}
              className="w-full px-3 py-2.5 sm:py-2 text-sm text-left hover:bg-accent flex items-center gap-2 min-h-[44px] sm:min-h-0"
            >
              <Search className="h-4 w-4" /> Search
            </button>
            <button
              type="button"
              onClick={() => {
                onToggleFullscreen();
                setShowOverflow(false);
              }}
              className="w-full px-3 py-2.5 sm:py-2 text-sm text-left hover:bg-accent flex items-center gap-2 min-h-[44px] sm:min-h-0"
            >
              {isFullscreen ? (
                <>
                  <Minimize className="h-4 w-4" /> Exit fullscreen
                </>
              ) : (
                <>
                  <Maximize className="h-4 w-4" /> Fullscreen
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                onDownload();
                setShowOverflow(false);
              }}
              className="w-full px-3 py-2.5 sm:py-2 text-sm text-left hover:bg-accent flex items-center gap-2 min-h-[44px] sm:min-h-0"
            >
              <Download className="h-4 w-4" /> Download
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
