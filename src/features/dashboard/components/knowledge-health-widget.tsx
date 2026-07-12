import Link from "next/link";
import { Brain, AlertTriangle, BookOpen } from "lucide-react";

type KnowledgeHealthWidgetProps = {
  noteCount: number;
  connectionCount: number;
  gapCount: number;
  reviewsDue: number;
};

export function KnowledgeHealthWidget({
  noteCount,
  connectionCount,
  gapCount,
  reviewsDue,
}: KnowledgeHealthWidgetProps) {
  return (
    <div>
      <p className="section-label mb-3">Knowledge Health</p>
      <div className="space-y-2">
        <Link
          href="/notes"
          className="flex items-center justify-between hover:bg-accent/50 -mx-2 px-2 py-1 rounded transition-colors"
        >
          <span className="text-sm text-muted-foreground flex items-center gap-2">
            <Brain className="w-3.5 h-3.5" />
            Notes & Connections
          </span>
          <span className="text-sm font-medium">
            {noteCount} notes, {connectionCount} links
          </span>
        </Link>

        {gapCount > 0 && (
          <Link
            href="/notes?view=gaps"
            className="flex items-center justify-between hover:bg-accent/50 -mx-2 px-2 py-1 rounded transition-colors"
          >
            <span className="text-sm text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5" />
              Knowledge Gaps
            </span>
            <span className="text-sm font-medium text-amber-600">
              {gapCount} detected
            </span>
          </Link>
        )}

        {reviewsDue > 0 && (
          <Link
            href="/notes?view=review"
            className="flex items-center justify-between hover:bg-accent/50 -mx-2 px-2 py-1 rounded transition-colors"
          >
            <span className="text-sm text-muted-foreground flex items-center gap-2">
              <BookOpen className="w-3.5 h-3.5" />
              Due for Review
            </span>
            <span className="text-sm font-medium">
              {reviewsDue} notes
            </span>
          </Link>
        )}
      </div>
    </div>
  );
}
