import TodayPageClient from "@/features/dashboard/components/today-page-client";
import { getCurrentUserId } from "@/lib/auth";
import { getNow } from "@/lib/clock";
import { getDsaDueSummary } from "@/features/dsa/lib/summary";
import { getLatestDailyBriefs } from "@/features/briefs/lib/storage";
import {
  isBriefPayloadV2,
  parseStoredBriefPayload,
} from "@/features/briefs/lib/payload-v2";
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
      const parsed = parseStoredBriefPayload(latest.payload);
      if (parsed) {
        if (isBriefPayloadV2(parsed)) {
          briefSummary = {
            kind: latest.kind,
            forDate: formatDateOnly(latest.forDate),
            headline: parsed.headline?.text ?? parsed.pushSummary,
            nextUpLine: parsed.nextUp
              ? `Next up: ${parsed.nextUp.title} at ${parsed.nextUp.startsAt} (in ${parsed.nextUp.minutesRemaining}m)`
              : null,
            pushSummary: parsed.pushSummary,
          };
        } else {
          briefSummary = {
            kind: latest.kind,
            forDate: formatDateOnly(latest.forDate),
            pushSummary: parsed.pushSummary,
          };
        }
      }
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
