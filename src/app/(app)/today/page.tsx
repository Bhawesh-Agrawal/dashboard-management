import TodayPageClient from "@/features/dashboard/components/today-page-client";
import { getCurrentUserId } from "@/lib/auth";
import { getNow } from "@/lib/clock";
import { getDsaDueSummary } from "@/features/dsa/lib/summary";

export const revalidate = 0;

export default async function TodayPage() {
  let dsaSummary = null;
  try {
    const userId = await getCurrentUserId();
    dsaSummary = await getDsaDueSummary(userId, getNow());
  } catch {
    dsaSummary = null;
  }

  return (
    <div>
      <TodayPageClient dsaSummary={dsaSummary} />
    </div>
  );
}
