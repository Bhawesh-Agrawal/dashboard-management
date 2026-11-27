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
import { formatDateOnly, getTodayInTimezone } from "@/lib/timezone";
import { getUserTimezone } from "@/lib/timezone-server";
import { getAcademicEntriesForRange } from "@/features/semesters/lib/calendar-queries";
import { semesterStatus } from "@/features/semesters/lib/status";
import { prisma } from "@/lib/prisma";
import {
  addDaysToDateStr,
  buildTodayAcademicLines,
} from "@/features/dashboard/lib/today-academic";

export const revalidate = 0;

export default async function TodayPage() {
  let dsaSummary = null;
  let briefSummary: BriefTodaySummary | null = null;
  let todayAcademicLines: string[] = [];
  try {
    const userId = await getCurrentUserId();
    const now = getNow();
    const tz = await getUserTimezone();
    const todayStr = getTodayInTimezone(tz, now);
    const tomorrowStr = addDaysToDateStr(todayStr, 1);

    const [dsa, briefs, academicEntries, semesters] = await Promise.all([
      getDsaDueSummary(userId, now),
      getLatestDailyBriefs(userId),
      getAcademicEntriesForRange(userId, todayStr, tomorrowStr),
      prisma.semester.findMany({
        where: { userId },
        select: { id: true, name: true, startDate: true, endDate: true },
        orderBy: { startDate: "asc" },
      }),
    ]);

    const activeSem = semesters.find((s) => semesterStatus(s, todayStr) === "active");
    const upcomingSem = !activeSem
      ? semesters.find((s) => semesterStatus(s, todayStr) === "upcoming")
      : undefined;

    todayAcademicLines = buildTodayAcademicLines({
      entries: academicEntries,
      todayStr,
      tomorrowStr,
      upcomingSemester: upcomingSem
        ? {
            id: upcomingSem.id,
            name: upcomingSem.name,
            startDate: formatDateOnly(upcomingSem.startDate),
          }
        : null,
    });

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
      <TodayPageClient
        dsaSummary={dsaSummary}
        briefSummary={briefSummary}
        todayAcademicLines={todayAcademicLines}
      />
    </div>
  );
}
