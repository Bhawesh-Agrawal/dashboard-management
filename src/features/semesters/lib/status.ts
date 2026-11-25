import { formatDateOnly } from "@/lib/timezone";

export type SemesterLifecycleStatus = "upcoming" | "active" | "ended";

export interface SemesterDateRange {
  startDate: Date | string;
  endDate: Date | string;
}

/**
 * Pure date-only semester lifecycle status.
 * Both `startDate` and `endDate` are inclusive.
 * Stored DateTime values are normalized to YYYY-MM-DD date-only strings before comparing
 * against `todayDateOnly` (which should be computed in the user's timezone).
 */
export function semesterStatus(
  semester: SemesterDateRange,
  todayDateOnly: string
): SemesterLifecycleStatus {
  const start = formatDateOnly(semester.startDate);
  const end = formatDateOnly(semester.endDate);
  const today = formatDateOnly(todayDateOnly);

  if (today < start) {
    return "upcoming";
  }
  if (today > end) {
    return "ended";
  }
  return "active";
}
