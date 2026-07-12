"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { NoteAnnotation } from "@prisma/client";

const ANNOTATION_COLORS: Record<string, string> = {
  HIGHLIGHT: "bg-yellow-400/30 border-yellow-500/50",
  NOTE: "bg-green-400/30 border-green-500/50",
  BOOKMARK: "bg-blue-400/30 border-blue-500/50",
  UNDERLINE: "bg-transparent border-b-2 border-purple-500",
  STRIKEOUT: "bg-transparent border-b-2 border-red-500 line-through",
};

const ANNOTATION_DOT_COLORS: Record<string, string> = {
  HIGHLIGHT: "bg-yellow-500",
  NOTE: "bg-green-500",
  BOOKMARK: "bg-blue-500",
  UNDERLINE: "bg-purple-500",
  STRIKEOUT: "bg-red-500",
};

export interface PdfAnnotationOverlayProps {
  annotations: NoteAnnotation[];
  pageNumber: number;
  scale: number;
}

export function PdfAnnotationOverlay({
  annotations,
  pageNumber,
  scale,
}: PdfAnnotationOverlayProps) {
  const visibleAnnotations = useMemo(
    () => annotations.filter((a) => a.pageNumber === pageNumber),
    [annotations, pageNumber]
  );

  if (visibleAnnotations.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {visibleAnnotations.map((annotation) => {
        if (annotation.x == null || annotation.y == null) return null;

        const width = annotation.width ?? 100;
        const height = annotation.height ?? 20;

        const style: React.CSSProperties = {
          left: `${annotation.x * scale}px`,
          top: `${annotation.y * scale}px`,
          width: `${width * scale}px`,
          height: `${height * scale}px`,
        };

        return (
          <div
            key={annotation.id}
            className={cn(
              "absolute rounded-sm border",
              ANNOTATION_COLORS[annotation.type] ?? "bg-muted/30 border-border"
            )}
            style={style}
            title={annotation.text || annotation.type}
          >
            {annotation.text && (
              <div className="absolute -top-6 left-0 bg-popover border rounded px-1.5 py-0.5 text-[10px] shadow-sm whitespace-nowrap max-w-[200px] truncate z-10">
                <span
                  className={cn(
                    "inline-block w-1.5 h-1.5 rounded-full mr-1",
                    ANNOTATION_DOT_COLORS[annotation.type] ?? "bg-muted-foreground"
                  )}
                />
                {annotation.text}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
