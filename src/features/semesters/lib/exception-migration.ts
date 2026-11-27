import type { DayOfWeek } from "@prisma/client";
import { formatDateOnly } from "@/lib/timezone";

export interface ScheduleWithExceptionsForMigration {
  id: string;
  dayOfWeek: DayOfWeek;
  exceptions: Array<{
    id: string;
    date: Date | string;
    type: string;
    reason?: string | null;
  }>;
}

export interface RepeatedHolidayCandidate {
  date: string;
  title: string;
  exceptionIds: string[];
  scheduleCount: number;
}

const JS_DAY_TO_PRISMA: DayOfWeek[] = [
  "SUN",
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
];

/**
 * Pure detector for dates where every scheduled class on that weekday
 * has a `cancelled` ScheduleException.
 */
export function detectRepeatedCancelledDates(
  schedules: ScheduleWithExceptionsForMigration[]
): RepeatedHolidayCandidate[] {
  const schedulesByDay = new Map<DayOfWeek, Set<string>>();
  for (const s of schedules) {
    const set = schedulesByDay.get(s.dayOfWeek) ?? new Set<string>();
    set.add(s.id);
    schedulesByDay.set(s.dayOfWeek, set);
  }

  const byDate = new Map<
    string,
    { scheduleIds: Set<string>; exceptionIds: string[]; reasons: string[] }
  >();

  for (const s of schedules) {
    for (const ex of s.exceptions) {
      if (ex.type !== "cancelled") continue;
      const dateStr = formatDateOnly(ex.date);
      const entry = byDate.get(dateStr) ?? {
        scheduleIds: new Set<string>(),
        exceptionIds: [],
        reasons: [],
      };
      entry.scheduleIds.add(s.id);
      entry.exceptionIds.push(ex.id);
      if (ex.reason?.trim()) {
        entry.reasons.push(ex.reason.trim());
      }
      byDate.set(dateStr, entry);
    }
  }

  const candidates: RepeatedHolidayCandidate[] = [];
  for (const [dateStr, info] of byDate.entries()) {
    const jsDay = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
    const prismaDay = JS_DAY_TO_PRISMA[jsDay];
    const daySchedules = schedulesByDay.get(prismaDay);
    if (!daySchedules || daySchedules.size === 0) continue;

    const allCancelled = Array.from(daySchedules).every((id) =>
      info.scheduleIds.has(id)
    );
    if (!allCancelled) continue;

    // Pick most frequent non-empty reason, defaulting to "Holiday"
    const counts = new Map<string, number>();
    for (const r of info.reasons) {
      counts.set(r, (counts.get(r) ?? 0) + 1);
    }
    let bestTitle = "Holiday";
    let bestCount = 0;
    for (const [reason, count] of counts.entries()) {
      if (count > bestCount) {
        bestTitle = reason;
        bestCount = count;
      }
    }

    candidates.push({
      date: dateStr,
      title: bestTitle,
      exceptionIds: info.exceptionIds,
      scheduleCount: daySchedules.size,
    });
  }

  return candidates.sort((a, b) => a.date.localeCompare(b.date));
}
