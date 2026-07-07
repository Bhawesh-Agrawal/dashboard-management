"use client";

import { Link } from "next-view-transitions";
import type { SearchResult } from "@/features/search/lib/queries";
import { FileText, CheckSquare, GraduationCap, Quote } from "lucide-react";

const typeConfig = {
  note: { icon: FileText, label: "NOTE", color: "text-blue-600" },
  task: { icon: CheckSquare, label: "TASK", color: "text-amber-600" },
  course: { icon: GraduationCap, label: "COURSE", color: "text-green-600" },
  quote: { icon: Quote, label: "QUOTE", color: "text-purple-600" },
};

export function SearchResults({ results }: { results: SearchResult[] }) {
  if (results.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No results found</p>
      </div>
    );
  }

  // Group results by type
  const grouped = results.reduce(
    (acc, result) => {
      const existing = acc[result.type] || [];
      existing.push(result);
      acc[result.type] = existing;
      return acc;
    },
    {} as Record<string, SearchResult[]>
  );

  const typeOrder: (keyof typeof typeConfig)[] = [
    "note",
    "task",
    "course",
    "quote",
  ];

  return (
    <div className="space-y-6">
      {typeOrder.map((type) => {
        const items = grouped[type];
        if (!items || items.length === 0) return null;

        const config = typeConfig[type];
        const Icon = config.icon;

        return (
          <div key={type}>
            <p className="section-label mb-2">
              {config.label} · {items.length}
            </p>
            <div className="space-y-0.5">
              {items.map((result) => (
                <Link
                  key={result.id}
                  href={result.url}
                  className="list-row items-start gap-3"
                >
                  <Icon
                    className={`h-4 w-4 mt-0.5 shrink-0 ${config.color}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {result.title}
                      </span>
                      {result.courseName && (
                        <span
                          className="text-xs px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: result.courseColor
                              ? `${result.courseColor}20`
                              : undefined,
                            color: result.courseColor ?? undefined,
                          }}
                        >
                          {result.courseName}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {result.snippet}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
