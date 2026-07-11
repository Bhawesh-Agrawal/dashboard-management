import { ReviewCard } from "./review-card";
import type { ReviewType, ReviewStatus } from "@prisma/client";

export function ReviewList({
  reviews,
}: {
  reviews: {
    id: string;
    type: ReviewType;
    periodStart: Date;
    periodEnd: Date;
    status: ReviewStatus;
    summary: string;
  }[];
}) {
  if (reviews.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-muted-foreground">No reviews found</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reviews.map((review) => (
        <ReviewCard
          key={review.id}
          id={review.id}
          type={review.type}
          periodStart={review.periodStart}
          periodEnd={review.periodEnd}
          status={review.status}
          summary={review.summary}
        />
      ))}
    </div>
  );
}
