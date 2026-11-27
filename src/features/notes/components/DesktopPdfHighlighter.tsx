"use client";

import { useEffect } from "react";
import {
  PdfLoader,
  PdfHighlighter,
  Highlight as LibHighlight,
  AreaHighlight,
  TextHighlight,
  usePdfHighlighterContext,
  useHighlightContainerContext,
  type PdfSelection,
} from "react-pdf-highlighter-extended";
import { TextSelectionFloatingBar } from "./TextSelectionFloatingBar";
import { toast } from "sonner";

function HighlightContainer({
  onEdit,
  onDelete,
}: {
  onEdit?: (id: string, comment: string) => void;
  onDelete?: (id: string) => void;
}) {
  const { highlight, isScrolledTo } = useHighlightContainerContext<
    LibHighlight & { comment?: string; color?: string }
  >();
  const { toggleEditInProgress } = usePdfHighlighterContext();
  const isTextHighlight = !highlight.content?.image;

  const component = isTextHighlight ? (
    <TextHighlight
      isScrolledTo={isScrolledTo}
      highlight={highlight}
      onContextMenu={(event) => {
        event.preventDefault();
        if (onDelete && confirm("Delete this highlight?")) {
          onDelete(highlight.id);
        }
      }}
    />
  ) : (
    <AreaHighlight
      isScrolledTo={isScrolledTo}
      highlight={highlight}
      onChange={() => toggleEditInProgress(false)}
    />
  );

  return (
    <div
      className="group relative"
      title={highlight.comment ? `Note: ${highlight.comment}` : undefined}
      onClick={() => {
        if (onEdit) {
          const next = prompt("Edit annotation note:", highlight.comment || "");
          if (next !== null) onEdit(highlight.id, next);
        }
      }}
    >
      {component}
    </div>
  );
}

function DocumentLoadedHandler({
  pdfDocument,
  onLoadSuccess,
}: {
  pdfDocument: { numPages: number };
  onLoadSuccess: (doc: { numPages: number }) => void;
}) {
  useEffect(() => {
    onLoadSuccess(pdfDocument);
  }, [pdfDocument, onLoadSuccess]);
  return null;
}

export interface DesktopPdfHighlighterProps {
  viewUrl: string;
  containerWidth: number;
  zoom: number;
  totalPages: number;
  highlights: Array<LibHighlight & { comment?: string; color?: string }>;
  currentSelection: PdfSelection | null;
  activeColor: string;
  onLoadSuccess: (doc: { numPages: number }) => void;
  onSelection: (selection: PdfSelection | null) => void;
  onSaveAnnotation: (
    type: "HIGHLIGHT" | "UNDERLINE" | "NOTE",
    color: string
  ) => void;
  onDeleteAnnotation: (id: string) => void;
  onEditAnnotation: (id: string, comment: string) => void;
}

/**
 * Desktop-only annotation viewer using react-pdf-highlighter-extended.
 * Dynamically imported on desktop only because react-pdf-highlighter-extended@8.1.0
 * requires pdfjs-dist@4.10.38 (served from /pdfjs/highlighter.worker.min.mjs).
 */
export function DesktopPdfHighlighter({
  viewUrl,
  containerWidth,
  zoom,
  totalPages,
  highlights,
  currentSelection,
  activeColor,
  onLoadSuccess,
  onSelection,
  onSaveAnnotation,
  onDeleteAnnotation,
  onEditAnnotation,
}: DesktopPdfHighlighterProps) {
  return (
    <PdfLoader
      document={viewUrl}
      workerSrc="/pdfjs/highlighter.worker.min.mjs"
    >
      {(pdfDocument) => {
        const baseScale = containerWidth > 0 ? (containerWidth - 64) / 612 : 1.2;
        const computedScale =
          zoom === 100 ? "page-width" : baseScale * (zoom / 100);

        return (
          <>
            {pdfDocument.numPages !== totalPages && (
              <DocumentLoadedHandler
                pdfDocument={pdfDocument}
                onLoadSuccess={onLoadSuccess}
              />
            )}
            <PdfHighlighter
              pdfDocument={pdfDocument}
              enableAreaSelection={(event) => event.altKey}
              pdfScaleValue={computedScale}
              utilsRef={() => {}}
              onSelection={(selection) => onSelection(selection)}
              selectionTip={
                currentSelection ? (
                  <div className="flex gap-1 p-1 bg-popover border shadow-lg rounded-md z-50">
                    <TextSelectionFloatingBar
                      visible={true}
                      selectedText="selection"
                      activeColor={activeColor}
                      position={{ x: 0, y: 0 }}
                      inline={true}
                      onHighlight={() => onSaveAnnotation("HIGHLIGHT", activeColor)}
                      onUnderline={() => onSaveAnnotation("UNDERLINE", activeColor)}
                      onAddNote={() => onSaveAnnotation("NOTE", activeColor)}
                      onCopy={() => {
                        navigator.clipboard.writeText(
                          currentSelection.makeGhostHighlight().content.text || ""
                        );
                        toast.success("Copied to clipboard");
                        onSelection(null);
                      }}
                      onClose={() => onSelection(null)}
                    />
                  </div>
                ) : undefined
              }
              highlights={highlights}
            >
              <HighlightContainer
                onDelete={onDeleteAnnotation}
                onEdit={onEditAnnotation}
              />
            </PdfHighlighter>
          </>
        );
      }}
    </PdfLoader>
  );
}
