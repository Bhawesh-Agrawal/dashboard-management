/**
 * Attendance calculation module for computing attendance metrics, targets,
 * and academic buffer/recovery forecasts.
 */

export interface AttendanceMetrics {
  present: number;
  absent: number;
  cancelled: number;
  unmarked: number;
  totalCounted: number;
  totalRecorded: number;
  percent: number;
  targetPercent: number;
  canMissCount: number;
  mustAttendCount: number;
  status: "above_target" | "at_target" | "below_target";
}

export const DEFAULT_ATTENDANCE_TARGET_PERCENT = 75;

/**
 * Computes attendance percentage.
 * Formula: present / (present + absent) * 100
 * Cancelled and unmarked classes are excluded from the denominator.
 */
export function computeAttendancePercent(present: number, absent: number): number {
  const total = present + absent;
  if (total <= 0) return 0;
  return Math.round((present / total) * 1000) / 10;
}

/**
 * Calculates the number of upcoming classes the student can miss
 * without falling below targetPercent (default 75%).
 *
 * Formula: floor((present - (target / 100) * total) / (target / 100))
 */
export function computeCanMissClasses(
  present: number,
  absent: number,
  targetPercent: number = DEFAULT_ATTENDANCE_TARGET_PERCENT
): number {
  const total = present + absent;
  if (total <= 0) return 0;

  const target = targetPercent / 100;
  if (target <= 0) return Infinity;
  if (target >= 1) return 0;

  const currentPercent = (present / total) * 100;
  if (currentPercent < targetPercent) {
    return 0;
  }

  const margin = present - target * total;
  // Round to 9 decimal places to eliminate IEEE 754 precision issues before floor
  const canMiss = Math.floor(Math.round((margin / target) * 1e9) / 1e9);
  return Math.max(0, canMiss);
}

/**
 * Calculates the number of consecutive upcoming classes the student must attend
 * to raise their attendance back to targetPercent (default 75%).
 *
 * Formula: ceil(((target / 100) * total - present) / (1 - target / 100))
 */
export function computeMustAttendClasses(
  present: number,
  absent: number,
  targetPercent: number = DEFAULT_ATTENDANCE_TARGET_PERCENT
): number {
  const total = present + absent;
  if (total <= 0) return 0;

  const target = targetPercent / 100;
  if (target >= 1) {
    return absent > 0 ? Infinity : 0;
  }
  if (target <= 0) return 0;

  const currentPercent = (present / total) * 100;
  if (currentPercent >= targetPercent) {
    return 0;
  }

  const deficit = target * total - present;
  // Round to 9 decimal places to eliminate IEEE 754 precision issues before ceil
  const needed = Math.ceil(Math.round((deficit / (1 - target)) * 1e9) / 1e9);
  return Math.max(0, needed);
}

/**
 * Comprehensive attendance metrics calculation given counts and target.
 */
export function computeAttendanceMetrics({
  present,
  absent,
  cancelled = 0,
  unmarked = 0,
  targetPercent = DEFAULT_ATTENDANCE_TARGET_PERCENT,
}: {
  present: number;
  absent: number;
  cancelled?: number;
  unmarked?: number;
  targetPercent?: number;
}): AttendanceMetrics {
  const totalCounted = present + absent;
  const totalRecorded = present + absent + cancelled + unmarked;
  const percent = computeAttendancePercent(present, absent);
  const canMissCount = computeCanMissClasses(present, absent, targetPercent);
  const mustAttendCount = computeMustAttendClasses(present, absent, targetPercent);

  let status: AttendanceMetrics["status"] = "at_target";
  if (totalCounted === 0 || Math.abs(percent - targetPercent) < 0.01) {
    status = "at_target";
  } else if (percent > targetPercent) {
    status = "above_target";
  } else {
    status = "below_target";
  }

  return {
    present,
    absent,
    cancelled,
    unmarked,
    totalCounted,
    totalRecorded,
    percent,
    targetPercent,
    canMissCount,
    mustAttendCount,
    status,
  };
}

/**
 * Resolves attendance counts respecting auto vs manual mode semantics.
 *
 * Manual Mode:
 *   If course.attendanceMode === "manual" and manualTotalClasses is non-null:
 *   present = course.manualPresent ?? 0
 *   absent = max(0, manualTotalClasses - manualPresent)
 *
 * Auto Mode:
 *   Computed from attendance records or occurrences.
 */
export function resolveAttendanceCounts(course: {
  attendanceMode?: string | null;
  manualPresent?: number | null;
  manualTotalClasses?: number | null;
  attendanceRecords?: Array<{ status: string }> | null;
}): { present: number; absent: number; cancelled: number; unmarked: number } {
  if (
    course.attendanceMode === "manual" &&
    course.manualTotalClasses !== null &&
    course.manualTotalClasses !== undefined
  ) {
    const present = course.manualPresent ?? 0;
    const absent = Math.max(0, course.manualTotalClasses - present);
    return { present, absent, cancelled: 0, unmarked: 0 };
  }

  const records = course.attendanceRecords ?? [];
  let present = 0;
  let absent = 0;
  let cancelled = 0;
  let unmarked = 0;

  for (const r of records) {
    if (r.status === "present") present++;
    else if (r.status === "absent") absent++;
    else if (r.status === "cancelled") cancelled++;
    else unmarked++;
  }

  return { present, absent, cancelled, unmarked };
}
