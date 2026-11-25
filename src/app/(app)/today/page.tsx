import TodayPageClient from "@/features/dashboard/components/today-page-client";
import { getCurrentUserId } from "@/lib/auth";
import { getNow } from "@/lib/clock";
import { getDsaDueSummary } from "@/features/dsa/lib/summary";
import { getLatestDailyBriefs } from "@/features/briefs/lib/storage";
import type { BriefPayload } from "@/features/briefs/lib/build";
import type { BriefTodaySummary } from "@/features/briefs/components/brief-today-card";
import { formatDateOnly } from "@/lib/timezone";

export const revalidate = 0;

export default async function TodayPage() {
  let dsaSummary = null;
  let briefSummary: BriefTodaySummary | null = null;
  try {
    const userId = await getCurrentUserId();
    const [dsa, briefs] = await Promise.all([
      getDsaDueSummary(userId, getNow()),
      getLatestDailyBriefs(userId),
    ]);
    dsaSummary = dsa;
    const latest =
      briefs.morning && briefs.evening
        ? briefs.morning.generatedAt >= briefs.evening.generatedAt
          ? briefs.morning
          : briefs.evening
        : briefs.morning ?? briefs.evening;
    if (latest) {
      const payload = latest.payload as unknown as BriefPayload;
      briefSummary = {
        kind: latest.kind,
        forDate: formatDateOnly(latest.forDate),
        pushSummary: payload.pushSummary,
      };
    }
  } catch {
    dsaSummary = null;
    briefSummary = null;
  }

  return (
    <div>
      <TodayPageClient dsaSummary={dsaSummary} briefSummary={briefSummary} />
    </div>
  );
}
