import { Suspense } from "react";
import { getReviews, getUnviewedCount } from "@/features/reviews/lib/actions";
import { getCurrentUserId } from "@/lib/auth";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ReviewList } from "@/features/reviews/components/review-list";
import { ReviewTypeFilter } from "@/features/reviews/components/review-type-filter";
import type { ReviewType } from "@prisma/client";

export const revalidate = 0;

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const params = await searchParams;
  const userId = await getCurrentUserId();
  const type = params.type as ReviewType | undefined;

  const [reviews, unviewedCount] = await Promise.all([
    getReviews(userId, type, 30),
    getUnviewedCount(userId),
  ]);

  return (
    <div>
      <PageHeader
        title="Reviews"
        subtitle={
          unviewedCount > 0
            ? `${unviewedCount} unread review${unviewedCount !== 1 ? "s" : ""}`
            : "Periodic summaries of your progress"
        }
      />

      <Suspense fallback={null}>
        <div className="mb-6">
          <ReviewTypeFilter activeType={type || "all"} />
        </div>
      </Suspense>

      {reviews.length === 0 ? (
        <EmptyState
          title="No reviews yet"
          description="Reviews are generated automatically from your data. Weekly reviews appear every Sunday."
        />
      ) : (
        <ReviewList reviews={reviews} />
      )}
    </div>
  );
}
