import Link from "next/link";
import { format } from "date-fns";
import { ReviewTypeBadge } from "./review-type-badge";
import type { ReviewType, ReviewStatus } from "@prisma/client";

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
  const firstLine = summary.split("\n")[0].slice(0, 120);
  const dateRange = `${format(new Date(periodStart), "MMM d")} – ${format(new Date(periodEnd), "MMM d")}`;

  return (
    <Link
      href={`/reviews/${id}`}
      className={`block rounded-lg border transition-all hover:shadow-sm ${
        isUnviewed
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
            {isUnviewed && (
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            )}
            <span className="text-[0.625rem] text-muted-foreground uppercase tracking-wider">
              {status}
            </span>
          </div>
        </div>
        <p className="text-sm text-foreground/80 line-clamp-2">{firstLine}</p>
      </div>
    </Link>
  );
}
