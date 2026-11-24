import { DayOfWeek } from "@prisma/client";
import {
  DEFAULT_TIMEZONE,
  formatDateOnly,
  getTodayInTimezone,
  getClassTimingStatus,
  ClassTimingStatus,
} from "@/lib/timezone";
import { getNow } from "@/lib/clock";

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
  date: Date | string;
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

/**
 * Pure function: given a list of schedules, exceptions, and attendance records across a date range,
 * generates all occurrences with their exact status.
 */
export function generateOccurrences({
  schedules,
  exceptions = [],
  records = [],
  startDate,
  endDate,
  timezone = DEFAULT_TIMEZONE,
  now,
}: {
  schedules: OccurrenceSchedule[];
  exceptions?: OccurrenceException[];
  records?: OccurrenceRecord[];
  startDate: string; // "YYYY-MM-DD"
  endDate: string; // "YYYY-MM-DD"
  timezone?: string;
  now?: Date;
}): ClassOccurrence[] {
  const currentClock = now ?? getNow();
  const todayStr = getTodayInTimezone(timezone, currentClock);

  // Index exceptions by `${classScheduleId}_${dateStr}`
  const exceptionMap = new Map<string, OccurrenceException>();
  for (const ex of exceptions) {
    const dStr = formatDateOnly(ex.date);
    exceptionMap.set(`${ex.classScheduleId}_${dStr}`, ex);
  }

  // Index records by `${classScheduleId}_${dateStr}` and fallback by `${courseId}_${dateStr}`
  const recordBySchedule = new Map<string, OccurrenceRecord>();
  const recordByCourse = new Map<string, OccurrenceRecord>();
  for (const rec of records) {
    const dStr = formatDateOnly(rec.date);
    if (rec.classScheduleId) {
      recordBySchedule.set(`${rec.classScheduleId}_${dStr}`, rec);
    }
    // For legacy records without classScheduleId
    recordByCourse.set(`${rec.courseId}_${dStr}`, rec);
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

      // Check attendance record (linked schedule first, then course fallback)
      const record = recordBySchedule.get(occurrenceKey) || recordByCourse.get(`${schedule.courseId}_${dateStr}`);

      let status: OccurrenceStatus = "unmarked";
      let attendanceRecordId: string | undefined;

      if (record) {
        attendanceRecordId = record.id;
        if (record.status === "present") status = "present";
        else if (record.status === "absent") status = "absent";
        else if (record.status === "cancelled") status = "cancelled";
        else status = "unmarked";
      } else if (exception?.type === "cancelled") {
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

  // Sort occurrences by date ascending, then startTime ascending
  occurrences.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.startTime.localeCompare(b.startTime);
  });

  return occurrences;
}
