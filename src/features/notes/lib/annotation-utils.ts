import type { NoteAnnotation } from "@prisma/client";

// ─── Types ──────────────────────────────────────────────────

export type AnnotationTool =
  | "highlight"
  | "underline"
  | "strikeout"
  | "note"
  | "bookmark";

// ─── Colors ─────────────────────────────────────────────────

export const HIGHLIGHT_COLORS = [
  "#FFD700", // Yellow
  "#22C55E", // Green
  "#3B82F6", // Blue
  "#EC4899", // Pink
  "#F97316", // Orange
] as const;

export const ANNOTATION_DEFAULT_COLORS: Record<AnnotationTool, string> = {
  highlight: "#FFD700",
  underline: "#A855F7",
  strikeout: "#EF4444",
  note: "#22C55E",
  bookmark: "#3B82F6",
};

export const TYPE_LABELS: Record<string, string> = {
  HIGHLIGHT: "Highlight",
  UNDERLINE: "Underline",
  STRIKEOUT: "Strikeout",
  NOTE: "Note",
  BOOKMARK: "Bookmark",
};

// ─── Annotation Type Mapping ────────────────────────────────

export function toolToAnnotationType(tool: AnnotationTool): string {
  return tool.toUpperCase();
}

export function annotationTypeToTool(type: string): AnnotationTool | null {
  const lower = type.toLowerCase();
  if (
    lower === "highlight" ||
    lower === "underline" ||
    lower === "strikeout" ||
    lower === "note" ||
    lower === "bookmark"
  ) {
    return lower as AnnotationTool;
  }
  return null;
}

// ─── Grouping ───────────────────────────────────────────────

export function groupAnnotationsBy(
  annotations: NoteAnnotation[],
  groupBy: "page" | "type" | "color"
): Map<string, NoteAnnotation[]> {
  const groups = new Map<string, NoteAnnotation[]>();

  for (const annotation of annotations) {
    let key: string;
    switch (groupBy) {
      case "page":
        key = `Page ${annotation.pageNumber}`;
        break;
      case "type":
        key = TYPE_LABELS[annotation.type] ?? annotation.type;
        break;
      case "color":
        key = annotation.color;
        break;
      default:
        key = "Other";
    }
    const existing = groups.get(key) ?? [];
    existing.push(annotation);
    groups.set(key, existing);
  }

  return groups;
}

// ─── Markdown Export ────────────────────────────────────────

export function exportAnnotationsAsMarkdown(
  annotations: NoteAnnotation[],
  title: string
): string {
  const lines: string[] = [];

  lines.push(`# Annotations: ${title}`);
  lines.push("");
  lines.push(
    `> Generated on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`
  );
  lines.push("");

  const byPage = groupAnnotationsBy(annotations, "page");

  const sortedPages = Array.from(byPage.keys()).sort((a, b) => {
    const numA = parseInt(a.replace(/\D/g, ""), 10) || 0;
    const numB = parseInt(b.replace(/\D/g, ""), 10) || 0;
    return numA - numB;
  });

  for (const pageKey of sortedPages) {
    const pageAnnotations = byPage.get(pageKey) ?? [];
    lines.push(`## ${pageKey}`);
    lines.push("");

    for (const annotation of pageAnnotations) {
      const typeLabel = TYPE_LABELS[annotation.type] ?? annotation.type;
      const colorHex = annotation.color;

      if (annotation.text) {
        lines.push(`- **${typeLabel}** (${colorHex}): ${annotation.text}`);
      } else {
        lines.push(`- **${typeLabel}** (${colorHex})`);
      }


    }

    lines.push("");
  }

  const stats = {
    total: annotations.length,
    highlights: annotations.filter((a) => a.type === "HIGHLIGHT").length,
    underlines: annotations.filter((a) => a.type === "UNDERLINE").length,
    strikeouts: annotations.filter((a) => a.type === "STRIKEOUT").length,
    notes: annotations.filter((a) => a.type === "NOTE").length,
    bookmarks: annotations.filter((a) => a.type === "BOOKMARK").length,
  };

  lines.push("---");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- **Total annotations:** ${stats.total}`);
  if (stats.highlights > 0)
    lines.push(`- **Highlights:** ${stats.highlights}`);
  if (stats.underlines > 0)
    lines.push(`- **Underlines:** ${stats.underlines}`);
  if (stats.strikeouts > 0)
    lines.push(`- **Strikeouts:** ${stats.strikeouts}`);
  if (stats.notes > 0) lines.push(`- **Notes:** ${stats.notes}`);
  if (stats.bookmarks > 0)
    lines.push(`- **Bookmarks:** ${stats.bookmarks}`);

  return lines.join("\n");
}

export function downloadMarkdown(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
