"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { X, FileText, Download, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
const PdfViewerModal = dynamic(
  () => import("./PdfViewerModal").then((m) => m.PdfViewerModal),
  { ssr: false }
);
import { convertDocxToMarkdown } from "../lib/actions-convert";
import { getFileViewUrl } from "../lib/actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import type { NoteAnnotation } from "@prisma/client";

function isLocalUrl(url: string | null | undefined) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname.startsWith("192.168.");
  } catch {
    return url.startsWith("/") || url.includes("localhost") || url.includes("127.0.0.1");
  }
}

export interface FileViewerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  note: any; // NoteWithDocumentInfo
  annotations?: NoteAnnotation[];
}

export function FileViewerModal({
  open,
  onOpenChange,
  note,
  annotations,
}: FileViewerModalProps) {
  const router = useRouter();
  const [isConverting, setIsConverting] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  // Reset state when note changes
  useEffect(() => {
    setImageError(false);
    setViewUrl(null);
    setUrlError(null);
  }, [note?.id]);

  // Fetch a fresh presigned GET URL for non-PDF files
  useEffect(() => {
    if (!open || !note || !note.s3Url || note.documentType === "PDF") {
      return;
    }

    let cancelled = false;
    setIsLoadingUrl(true);
    setUrlError(null);

    getFileViewUrl(note.id, undefined, note.s3Key ?? undefined).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setViewUrl(result.data.url);
      } else {
        setUrlError(result.error);
      }
      setIsLoadingUrl(false);
    });

    return () => {
      cancelled = true;
    };
  }, [open, note?.id, note?.s3Url, note?.documentType, note?.s3Key]);

  // If there's no note or URL, don't render anything
  if (!note || !note.s3Url) return null;

  // Render PDF using the advanced PdfViewerModal
  if (note.documentType === "PDF") {
    return (
      <PdfViewerModal
        open={open}
        onOpenChange={onOpenChange}
        noteId={note.id}
        s3Key={note.s3Key ?? undefined}
        s3Url={note.s3Url}
        title={note.title || note.fileName || "Untitled"}
        annotations={annotations}
      />
    );
  }

  const handleConvert = async () => {
    setIsConverting(true);
    const result = await convertDocxToMarkdown(note.id);
    setIsConverting(false);

    if (result.ok) {
      toast.success("Document converted to markdown!");
      onOpenChange(false);
      router.push(`/notes/${note.id}`);
    } else {
      toast.error(result.error || "Failed to convert document");
    }
  };

  const isImage = note.documentType === "IMAGE";
  const isVideo = note.documentType === "VIDEO";
  const isAudio = note.documentType === "AUDIO";
  const isOfficeDoc = note.documentType === "DOCUMENT" && (note.fileName?.toLowerCase().endsWith(".docx") || note.fileName?.toLowerCase().endsWith(".pptx") || note.fileName?.toLowerCase().endsWith(".xlsx"));

  // The URL to use for rendering media: prefer the fresh presigned URL, fall back to stored URL
  const mediaUrl = viewUrl || note.s3Url;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="p-0 overflow-hidden flex flex-col bg-background/95 backdrop-blur border-border/50 shadow-2xl"
        style={{ width: "95vw", maxWidth: "1200px", height: "90vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-border/50 shrink-0 bg-background/50">
          <div className="flex items-center gap-3 truncate">
            <span className="font-medium text-sm truncate max-w-[300px] sm:max-w-[500px]">
              {note.title || note.fileName || "File Viewer"}
            </span>
            {isOfficeDoc && (
              <span className="text-[0.65rem] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 font-medium">
                Office Document
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isOfficeDoc && note.fileName?.toLowerCase().endsWith(".docx") && (
              <button
                type="button"
                onClick={handleConvert}
                disabled={isConverting}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {isConverting ? (
                  <span className="animate-spin mr-1">⟳</span>
                ) : (
                  <FileText className="h-3.5 w-3.5" />
                )}
                Convert to Markdown
              </button>
            )}
            <a
              href={mediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title="Download file"
            >
              <Download className="h-4 w-4" />
            </a>
            <button
              onClick={() => onOpenChange(false)}
              className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto bg-muted/20 flex items-center justify-center p-4 relative">
          {isLoadingUrl ? (
            <div className="text-center space-y-3">
              <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
              <p className="text-muted-foreground text-sm">Loading file...</p>
            </div>
          ) : urlError ? (
            <div className="text-center space-y-4">
              <FileText className="h-16 w-16 mx-auto text-muted-foreground/50" />
              <div className="space-y-1">
                <p className="font-medium text-sm text-foreground">
                  Files unavailable, storage is offline
                </p>
                <p className="text-muted-foreground text-xs">
                  {urlError}
                </p>
              </div>
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsLoadingUrl(true);
                    setUrlError(null);
                    getFileViewUrl(note.id, undefined, note.s3Key ?? undefined).then((result) => {
                      if (result.ok) {
                        setViewUrl(result.data.url);
                      } else {
                        setUrlError(result.error);
                      }
                      setIsLoadingUrl(false);
                    });
                  }}
                  className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                >
                  Retry
                </button>
                <a
                  href={note.s3Url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-input bg-background text-foreground text-xs font-medium rounded-md hover:bg-accent transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  Try Download
                </a>
              </div>
            </div>
          ) : isImage ? (
            imageError ? (
              <div className="text-center space-y-4">
                <FileText className="h-16 w-16 mx-auto text-muted-foreground/50" />
                <p className="text-muted-foreground text-sm">
                  Image could not be loaded.
                </p>
                <a
                  href={mediaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-colors"
                >
                  <Download className="h-4 w-4" />
                  Try Download
                </a>
              </div>
            ) : (
              <img
                src={mediaUrl}
                alt={note.title || "Image"}
                className="max-w-full max-h-full object-contain shadow-md rounded-md"
                onError={() => setImageError(true)}
              />
            )
          ) : isVideo ? (
            <video
              src={mediaUrl}
              controls
              className="max-w-full max-h-full shadow-md rounded-md"
            />
          ) : isAudio ? (
            <audio src={mediaUrl} controls className="w-full max-w-md shadow-md rounded-full" />
          ) : isOfficeDoc ? (
            isLocalUrl(mediaUrl) ? (
              <div className="text-center space-y-4 max-w-md">
                <FileText className="h-16 w-16 mx-auto text-muted-foreground/50" />
                <p className="text-muted-foreground text-sm">
                  Office documents cannot be previewed in the browser when running locally (requires a public URL). You can download the file or convert it to markdown.
                </p>
                <div className="flex items-center justify-center gap-3 mt-4">
                  {note.fileName?.toLowerCase().endsWith(".docx") && (
                    <button
                      type="button"
                      onClick={handleConvert}
                      disabled={isConverting}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-colors"
                    >
                      {isConverting ? (
                        <span className="animate-spin mr-1">⟳</span>
                      ) : (
                        <FileText className="h-4 w-4" />
                      )}
                      Convert to Markdown
                    </button>
                  )}
                  <a
                    href={mediaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 border border-input bg-background text-foreground text-sm font-medium rounded-md hover:bg-accent transition-colors"
                  >
                    <Download className="h-4 w-4" />
                    Download File
                  </a>
                </div>
              </div>
            ) : (
              <iframe
                src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(mediaUrl || "")}`}
                className="w-full h-full flex-1 border-0 bg-white rounded-md shadow-md min-h-full"
                title={note.title || "Office Document Viewer"}
              />
            )
          ) : (
            <div className="text-center space-y-4">
              <FileText className="h-16 w-16 mx-auto text-muted-foreground/50" />
              <p className="text-muted-foreground text-sm">
                This file type cannot be previewed in the browser.
              </p>
              <a
                href={mediaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-colors"
              >
                <Download className="h-4 w-4" />
                Download File
              </a>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
