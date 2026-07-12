"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { ReviewTypeBadge } from "./review-type-badge";
import { generateReviewAction, deleteReview } from "../lib/actions";
import type { ReviewType } from "@prisma/client";
import { RefreshCw, Trash2, AlertTriangle } from "lucide-react";

export function FallbackNotice({
  reviewId,
  type,
  periodStart,
  periodEnd,
}: {
  reviewId: string;
  type: ReviewType;
  periodStart: Date;
  periodEnd: Date;
}) {
  const [regenerating, setRegenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [, startTransition] = useTransition();
  const dateRange = `${format(new Date(periodStart), "MMM d, yyyy")} – ${format(new Date(periodEnd), "MMM d, yyyy")}`;

  async function handleRegenerate() {
    setRegenerating(true);
    const result = await generateReviewAction(type);
    if (result.ok) {
      window.location.href = `/reviews/${result.review.id}`;
    } else {
      setRegenerating(false);
    }
  }

  function handleDelete() {
    startTransition(async () => {
      setDeleting(true);
      await deleteReview(reviewId);
      window.location.href = "/reviews";
    });
  }

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-3">
          <ReviewTypeBadge type={type} />
          <span className="text-sm text-muted-foreground">{dateRange}</span>
        </div>
      </div>

      <div className="p-6 rounded-lg border border-amber-200 bg-amber-50/50 text-center">
        <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
        <h3 className="text-sm font-medium text-foreground mb-1">
          Review failed to generate
        </h3>
        <p className="text-xs text-muted-foreground mb-5 max-w-sm mx-auto">
          The AI could not produce a valid review for this period. You can try
          generating it again or delete this entry.
        </p>

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={handleRegenerate}
            disabled={regenerating || deleting}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md transition-colors disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${regenerating ? "animate-spin" : ""}`}
            />
            {regenerating ? "Generating..." : "Regenerate"}
          </button>
          <button
            onClick={handleDelete}
            disabled={regenerating || deleting}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-destructive border border-destructive/30 rounded-md transition-colors hover:bg-destructive/5 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
