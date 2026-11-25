import type { DayOfWeek } from "@prisma/client";
import {
  DEFAULT_TIMEZONE,
  formatDateOnly,
  getTodayInTimezone,
  getClassTimingStatus,
  ClassTimingStatus,
} from "@/lib/timezone";

export type OccurrenceStatus = "present" | "absent" | "cancelled" | "unmarked";

export interface OccurrenceSchedule {
  id: string;
  courseId: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  location?: string | null;
  effectiveStartDate?: Date | string | null;
  effectiveEndDate?: Date | string | null;
}

export interface OccurrenceException {
  id?: string;
  classScheduleId: string;
  date: Date | string; // "YYYY-MM-DD" or Date
  type: "cancelled" | "rescheduled";
  newStartTime?: string | null;
  newEndTime?: string | null;
  newLocation?: string | null;
}

export interface OccurrenceRecord {
  id?: string;
  courseId: string;
  classScheduleId?: string | null;
  date: Date | string;
  status: "present" | "absent" | "cancelled" | "not_marked";
}

export interface ClassOccurrence {
  occurrenceId: string; // unique key: `${classScheduleId}_${date}`
  classScheduleId: string;
  courseId: string;
  date: string; // "YYYY-MM-DD"
  dayOfWeek: DayOfWeek;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  location?: string | null;
  status: OccurrenceStatus;
  timingStatus: ClassTimingStatus;
  attendanceRecordId?: string;
  exceptionId?: string;
  exceptionType?: "cancelled" | "rescheduled";
  isException: boolean;
  isPast: boolean;
  isToday: boolean;
  isFuture: boolean;
  needsReview?: boolean;
}

export interface UnmatchedLegacyRecord {
  recordId?: string;
  courseId: string;
  date: string;
  status: string;
  reason: "ambiguous" | "no_schedule";
  candidateScheduleIds: string[];
}

const DOW_NUMBER_TO_ENUM: Record<number, DayOfWeek> = {
  0: "SUN",
  1: "MON",
  2: "TUE",
  3: "WED",
  4: "THU",
  5: "FRI",
  6: "SAT",
};

export interface GenerateOccurrencesOptions {
  schedules: OccurrenceSchedule[];
  exceptions?: OccurrenceException[];
  records?: OccurrenceRecord[];
  semesterStartDate?: Date | string | null;
  semesterEndDate?: Date | string | null;
  startDate?: string; // "YYYY-MM-DD" override
  endDate?: string; // "YYYY-MM-DD" override
  timezone?: string;
  now?: Date;
}

/**
 * Pure occurrence engine.
 * Computes individual class occurrences across recurring schedules,
 * respecting semester bounds, effective dates, schedule exceptions,
 * and attendance record matching with ambiguous legacy resolution.
 */
export function generateOccurrences({
  schedules,
  exceptions = [],
  records = [],
  semesterStartDate,
  semesterEndDate,
  startDate: explicitStartDate,
  endDate: explicitEndDate,
  timezone = DEFAULT_TIMEZONE,
  now,
}: GenerateOccurrencesOptions): ClassOccurrence[] {
  const currentClock = now ?? new Date();
  const todayStr = getTodayInTimezone(timezone, currentClock);

  // If no schedules exist, return empty occurrences immediately
  if (!schedules || schedules.length === 0) {
    return [];
  }

  // Determine date bounds
  let startDate = explicitStartDate;
  let endDate = explicitEndDate;

  if (!startDate) {
    startDate = semesterStartDate ? formatDateOnly(semesterStartDate) : todayStr;
  }
  if (!endDate) {
    endDate = semesterEndDate ? formatDateOnly(semesterEndDate) : todayStr;
  }

  // If start is after end, return empty
  if (startDate > endDate) {
    return [];
  }

  // Index exceptions by `${classScheduleId}_${dateStr}`
  const exceptionMap = new Map<string, OccurrenceException>();
  for (const ex of exceptions) {
    const dStr = formatDateOnly(ex.date);
    exceptionMap.set(`${ex.classScheduleId}_${dStr}`, ex);
  }

  // Index direct records by `${classScheduleId}_${dateStr}`
  const recordBySchedule = new Map<string, OccurrenceRecord>();
  const legacyRecords: OccurrenceRecord[] = [];

  for (const rec of records) {
    if (rec.classScheduleId) {
      const dStr = formatDateOnly(rec.date);
      recordBySchedule.set(`${rec.classScheduleId}_${dStr}`, rec);
    } else {
      legacyRecords.push(rec);
    }
  }

  const occurrences: ClassOccurrence[] = [];

  // Parse start and end date components (year, month, day) in UTC to prevent day skews
  const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = endDate.split("-").map(Number);

  const startUtc = Date.UTC(startYear, startMonth - 1, startDay);
  const endUtc = Date.UTC(endYear, endMonth - 1, endDay);

  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  for (let ms = startUtc; ms <= endUtc; ms += ONE_DAY_MS) {
    const cursorDate = new Date(ms);
    const dateStr = cursorDate.toISOString().slice(0, 10);
    const dayOfWeek = DOW_NUMBER_TO_ENUM[cursorDate.getUTCDay()];

    for (const schedule of schedules) {
      if (schedule.dayOfWeek !== dayOfWeek) continue;

      // Check effective start/end dates if configured
      if (schedule.effectiveStartDate) {
        const effStartStr = formatDateOnly(schedule.effectiveStartDate);
        if (dateStr < effStartStr) continue;
      }
      if (schedule.effectiveEndDate) {
        const effEndStr = formatDateOnly(schedule.effectiveEndDate);
        if (dateStr > effEndStr) continue;
      }

      const occurrenceKey = `${schedule.id}_${dateStr}`;
      const exception = exceptionMap.get(occurrenceKey);

      let startTime = schedule.startTime;
      let endTime = schedule.endTime;
      let location = schedule.location;
      let isException = false;
      let exceptionType: "cancelled" | "rescheduled" | undefined;

      if (exception) {
        isException = true;
        exceptionType = exception.type;
        if (exception.type === "rescheduled") {
          if (exception.newStartTime) startTime = exception.newStartTime;
          if (exception.newEndTime) endTime = exception.newEndTime;
          if (exception.newLocation !== undefined) location = exception.newLocation;
        }
      }

      // Check direct attendance record
      const directRecord = recordBySchedule.get(occurrenceKey);

      let status: OccurrenceStatus = "unmarked";
      let attendanceRecordId: string | undefined;

      if (directRecord) {
        attendanceRecordId = directRecord.id;
        if (directRecord.status === "present") status = "present";
        else if (directRecord.status === "absent") status = "absent";
        else if (directRecord.status === "cancelled") status = "cancelled";
        else status = "unmarked";
      }

      // Cancellation Rule: A ScheduleException of type "cancelled" ALWAYS wins.
      // If a record exists, we keep its ID but override status to "cancelled".
      if (exception?.type === "cancelled") {
        status = "cancelled";
      }

      const timingStatus = getClassTimingStatus({
        date: dateStr,
        startTime,
        endTime,
        timezone,
        now: currentClock,
      });

      const isToday = dateStr === todayStr;
      const isPast = dateStr < todayStr;
      const isFuture = dateStr > todayStr;

      occurrences.push({
        occurrenceId: occurrenceKey,
        classScheduleId: schedule.id,
        courseId: schedule.courseId,
        date: dateStr,
        dayOfWeek,
        startTime,
        endTime,
        location,
        status,
        timingStatus,
        attendanceRecordId,
        exceptionId: exception?.id,
        exceptionType,
        isException,
        isPast,
        isToday,
        isFuture,
      });
    }
  }

  // Match legacy records in memory (classScheduleId is NULL/undefined)
  // Rule: Match only when exactly ONE schedule of that course runs on that day.
  // When ambiguous (>1 schedule on that day), they stay unmatched in a "needs review" state.
  if (legacyRecords.length > 0) {
    // Group occurrences by `${courseId}_${date}`
    const occsByCourseDate = new Map<string, ClassOccurrence[]>();
    for (const occ of occurrences) {
      const key = `${occ.courseId}_${occ.date}`;
      const list = occsByCourseDate.get(key) || [];
      list.push(occ);
      occsByCourseDate.set(key, list);
    }

    for (const rec of legacyRecords) {
      const dStr = formatDateOnly(rec.date);
      const key = `${rec.courseId}_${dStr}`;
      const matchingOccs = occsByCourseDate.get(key) || [];

      if (matchingOccs.length === 1) {
        // Unique match: attach to the single occurrence if it doesn't already have a direct record
        const targetOcc = matchingOccs[0];
        if (!targetOcc.attendanceRecordId) {
          targetOcc.attendanceRecordId = rec.id;
          // Apply legacy status unless occurrence was cancelled by an exception
          if (targetOcc.exceptionType !== "cancelled") {
            if (rec.status === "present") targetOcc.status = "present";
            else if (rec.status === "absent") targetOcc.status = "absent";
            else if (rec.status === "cancelled") targetOcc.status = "cancelled";
            else targetOcc.status = "unmarked";
          }
        }
      } else if (matchingOccs.length > 1) {
        // Ambiguous match: multiple schedules run on the same day.
        // Legacy record stays UNMATCHED and occurrences enter a "needs review" state.
        for (const occ of matchingOccs) {
          occ.needsReview = true;
        }
      }
    }
  }

  // Sort occurrences by date ascending, then startTime ascending
  occurrences.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.startTime.localeCompare(b.startTime);
  });

  return occurrences;
}
