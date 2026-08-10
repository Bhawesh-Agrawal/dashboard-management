import TodayPageClient from "@/features/dashboard/components/today-page-client";
import { UnifiedInsights } from "@/features/insights/components/UnifiedInsights";

export const revalidate = 0;

export default function TodayPage() {
  return (
    <div>
      <TodayPageClient unifiedInsights={<UnifiedInsights />} />
    </div>
  );
}
