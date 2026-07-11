"use client";

import Link from "next/link";
import { format } from "date-fns";
import { ReviewTypeBadge } from "./review-type-badge";
import type { ReviewType, ReviewStatus } from "@prisma/client";
import { ArrowRight } from "lucide-react";

export function ReviewPreviewWidget({
  review,
  unviewedCount,
}: {
  review: {
    id: string;
    type: ReviewType;
    periodStart: Date;
    periodEnd: Date;
    status: ReviewStatus;
    summary: string;
  } | null;
  unviewedCount: number;
}) {
  if (!review) return null;

  const lines = review.summary.split("\n").filter(Boolean);
  const preview = lines.slice(0, 2).join(" ");
  const isUnviewed = review.status === "generated";
  const dateRange = `${format(new Date(review.periodStart), "MMM d")} – ${format(new Date(review.periodEnd), "MMM d")}`;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="section-label">LATEST REVIEW</p>
        {unviewedCount > 0 && (
          <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-primary text-primary-foreground text-[0.6rem] font-medium">
            {unviewedCount}
          </span>
        )}
      </div>
      <div
        className={`p-4 rounded-lg border transition-all ${
          isUnviewed
            ? "border-primary/20 ring-1 ring-primary/10 bg-card"
            : "border-border bg-card"
        }`}
      >
        <div className="flex items-center gap-2 mb-2">
          <ReviewTypeBadge type={review.type} />
          <span className="text-xs text-muted-foreground">{dateRange}</span>
          {isUnviewed && (
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse ml-auto" />
          )}
        </div>
        <p className="text-sm text-foreground/80 line-clamp-2 mb-3">{preview}</p>
        <Link
          href={`/reviews/${review.id}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Read Full Review
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
