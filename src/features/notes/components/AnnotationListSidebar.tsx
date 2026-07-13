"use client";

import { useState, useCallback } from "react";
import {
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  Download,
  List,
  Tag,
  Palette,
  StickyNote,
  Star,
  Highlighter,
  Underline,
  Strikethrough,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { NoteAnnotation } from "@prisma/client";
import {
  groupAnnotationsBy,
  TYPE_LABELS,
  exportAnnotationsAsMarkdown,
  downloadMarkdown,
} from "@/features/notes/lib/annotation-utils";

export interface AnnotationListSidebarProps {
  annotations: NoteAnnotation[];
  currentPage: number;
  documentTitle: string;
  onPageNavigate: (page: number) => void;
  onAnnotationEdit: (annotation: NoteAnnotation) => void;
  onAnnotationDelete: (id: string) => void;
  visible: boolean;
  onToggle: () => void;
}

type GroupBy = "page" | "type" | "color";

const TYPE_ICONS: Record<string, typeof Highlighter> = {
  HIGHLIGHT: Highlighter,
  UNDERLINE: Underline,
  STRIKEOUT: Strikethrough,
  NOTE: StickyNote,
  BOOKMARK: Star,
};

const GROUP_OPTIONS: { value: GroupBy; label: string; icon: typeof List }[] = [
  { value: "page", label: "Page", icon: List },
  { value: "type", label: "Type", icon: Tag },
  { value: "color", label: "Color", icon: Palette },
];

export function AnnotationListSidebar({
  annotations,
  currentPage,
  documentTitle,
  onPageNavigate,
  onAnnotationEdit,
  onAnnotationDelete,
  visible,
  onToggle,
}: AnnotationListSidebarProps) {
  const [groupBy, setGroupBy] = useState<GroupBy>("page");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set()
  );

  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const groups = groupAnnotationsBy(annotations, groupBy);
    setExpandedGroups(new Set(groups.keys()));
  }, [annotations, groupBy]);

  const collapseAll = useCallback(() => {
    setExpandedGroups(new Set());
  }, []);

  const handleExport = useCallback(() => {
    const md = exportAnnotationsAsMarkdown(annotations, documentTitle);
    const filename = `${documentTitle.replace(/[^a-zA-Z0-9]/g, "_")}_annotations.md`;
    downloadMarkdown(md, filename);
  }, [annotations, documentTitle]);

  if (!visible) return null;

  const groups = groupAnnotationsBy(annotations, groupBy);
  const groupKeys = Array.from(groups.keys()).sort((a, b) => {
    if (groupBy === "page") {
      const numA = parseInt(a.replace(/\D/g, ""), 10) || 0;
      const numB = parseInt(b.replace(/\D/g, ""), 10) || 0;
      return numA - numB;
    }
    return a.localeCompare(b);
  });

  return (
    <div
      className={cn(
        "w-full border-b bg-background/95 backdrop-blur-sm",
        "animate-in slide-in-from-top duration-200"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onToggle}
            title="Hide annotations"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs font-medium text-muted-foreground">
            Annotations ({annotations.length})
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Group by toggles */}
          {GROUP_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setGroupBy(opt.value)}
                className={cn(
                  "flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors",
                  groupBy === opt.value
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-2.5 w-2.5" />
                {opt.label}
              </button>
            );
          })}

          <div className="w-px h-3 bg-border mx-1" />

          <button
            type="button"
            onClick={expandAll}
            className="text-[10px] text-muted-foreground hover:text-foreground px-1"
          >
            Expand
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="text-[10px] text-muted-foreground hover:text-foreground px-1"
          >
            Collapse
          </button>

          <div className="w-px h-3 bg-border mx-1" />

          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleExport}
            title="Export as study guide"
          >
            <Download className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="max-h-40 overflow-y-auto">
        {annotations.length === 0 ? (
          <div className="px-4 py-3 text-xs text-muted-foreground text-center">
            No annotations yet
          </div>
        ) : (
          groupKeys.map((key) => {
            const groupAnnotations = groups.get(key) ?? [];
            const isExpanded =
              expandedGroups.size === 0 || expandedGroups.has(key);

            return (
              <div key={key}>
                {/* Group header */}
                <button
                  type="button"
                  onClick={() => toggleGroup(key)}
                  className={cn(
                    "w-full flex items-center gap-1.5 px-3 py-1 text-xs font-medium",
                    "text-muted-foreground hover:bg-muted/50 transition-colors",
                    "border-b border-border/30"
                  )}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  ) : (
                    <ChevronRight className="h-3 w-3 shrink-0" />
                  )}
                  <span>{key}</span>
                  <span className="text-muted-foreground/60">
                    ({groupAnnotations.length})
                  </span>
                </button>

                {/* Annotations in group */}
                {isExpanded &&
                  groupAnnotations.map((annotation) => {
                    const TypeIcon =
                      TYPE_ICONS[annotation.type] ?? Highlighter;
                    return (
                      <div
                        key={annotation.id}
                        className={cn(
                          "flex items-center gap-2 px-4 py-1.5 text-xs",
                          "hover:bg-muted/30 transition-colors group",
                          annotation.pageNumber === currentPage &&
                            "bg-accent/30"
                        )}
                      >
                        {/* Color dot */}
                        <div
                          className="w-2 h-2 rounded-full shrink-0 border border-border/50"
                          style={{ backgroundColor: annotation.color }}
                        />

                        {/* Type icon */}
                        <TypeIcon className="h-3 w-3 shrink-0 text-muted-foreground" />

                        {/* Text */}
                        <span className="flex-1 truncate text-foreground/80">
                          {annotation.text || TYPE_LABELS[annotation.type]}
                        </span>

                        {/* Page number */}
                        <span className="text-muted-foreground/60 shrink-0">
                          p.{annotation.pageNumber}
                        </span>

                        {/* Actions */}
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onPageNavigate(annotation.pageNumber);
                            }}
                            className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                            title="Go to page"
                          >
                            <ChevronRight className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onAnnotationEdit(annotation);
                            }}
                            className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                            title="Edit"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onAnnotationDelete(annotation.id);
                            }}
                            className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                            title="Delete"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
