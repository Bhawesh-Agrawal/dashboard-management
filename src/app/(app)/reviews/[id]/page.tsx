import { notFound } from "next/navigation";
import { getReviewById, markReviewViewed } from "@/features/reviews/lib/actions";
import { PageHeader } from "@/components/shared/page-header";
import { ReviewDetail } from "@/features/reviews/components/review-detail";
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

  // Mark as viewed on first load
  if (review.status === "generated") {
    await markReviewViewed(id);
  }

  const sections = (review.sections as unknown as ReviewSection[]) || [];
  const actions = (review.actions as unknown as ActionItem[]) || [];
  const metrics = (review.metrics as unknown as ReviewMetrics) || {};

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
