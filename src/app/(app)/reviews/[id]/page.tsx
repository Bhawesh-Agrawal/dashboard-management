import { notFound } from "next/navigation";
import { getReviewById, markReviewViewed } from "@/features/reviews/lib/actions";
import { isFallbackReview } from "@/features/reviews/lib/generator";
import { PageHeader } from "@/components/shared/page-header";
import { ReviewDetail } from "@/features/reviews/components/review-detail";
import { FallbackNotice } from "@/features/reviews/components/fallback-notice";
import type { ReviewSection, ActionItem, ReviewMetrics } from "@/features/reviews/lib/types";

export const revalidate = 0;

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const review = await getReviewById(id);

  if (!review) notFound();

  const failed = isFallbackReview(review.summary);

  // Mark as viewed on first load (skip for fallbacks — keep as unread for cleanup)
  if (review.status === "generated" && !failed) {
    await markReviewViewed(id);
  }

  // If this is a fallback/broken review, show a clean notice instead
  if (failed) {
    return (
      <div>
        <PageHeader title="Review" backHref="/reviews" />
        <FallbackNotice
          reviewId={review.id}
          type={review.type}
          periodStart={review.periodStart}
          periodEnd={review.periodEnd}
        />
      </div>
    );
  }

  const sections = (review.sections as ReviewSection[]) || [];
  const actions = (review.actions as ActionItem[]) || [];
  const metrics = (review.metrics as ReviewMetrics) || {};

  return (
    <div>
      <PageHeader title="Review" backHref="/reviews" />
      <ReviewDetail
        id={review.id}
        type={review.type}
        periodStart={review.periodStart}
        periodEnd={review.periodEnd}
        createdAt={review.createdAt}
        summary={review.summary}
        sections={sections}
        actions={actions}
        metrics={metrics}
      />
    </div>
  );
}
