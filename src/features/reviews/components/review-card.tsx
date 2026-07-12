import Link from "next/link";
import { format } from "date-fns";
import { ReviewTypeBadge } from "./review-type-badge";
import { isFallbackReview } from "../lib/generator";
import type { ReviewType, ReviewStatus } from "@prisma/client";
import { AlertTriangle } from "lucide-react";

export function ReviewCard({
  id,
  type,
  periodStart,
  periodEnd,
  status,
  summary,
}: {
  id: string;
  type: ReviewType;
  periodStart: Date;
  periodEnd: Date;
  status: ReviewStatus;
  summary: string;
}) {
  const isUnviewed = status === "generated";
  const failed = isFallbackReview(summary);
  const firstLine = failed
    ? "Failed to generate — tap to retry"
    : summary.split("\n")[0].slice(0, 120);
  const dateRange = `${format(new Date(periodStart), "MMM d")} – ${format(new Date(periodEnd), "MMM d")}`;

  return (
    <Link
      href={`/reviews/${id}`}
      className={`block rounded-lg border transition-all hover:shadow-sm ${
        failed
          ? "border-amber-200 bg-amber-50/30"
          : isUnviewed
            ? "border-primary/20 ring-1 ring-primary/10 bg-card"
            : "border-border bg-card"
      }`}
    >
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ReviewTypeBadge type={type} />
            <span className="text-xs text-muted-foreground">{dateRange}</span>
          </div>
          <div className="flex items-center gap-2">
            {failed && (
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            )}
            {isUnviewed && !failed && (
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            )}
            <span className="text-[0.625rem] text-muted-foreground uppercase tracking-wider">
              {status}
            </span>
          </div>
        </div>
        <p
          className={`text-sm line-clamp-2 ${
            failed
              ? "text-amber-600 italic"
              : "text-foreground/80"
          }`}
        >
          {firstLine}
        </p>
      </div>
    </Link>
  );
}
