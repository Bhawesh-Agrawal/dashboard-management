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

export interface OccurrenceCalendarEntry {
  id?: string;
  semesterId?: string;
  kind:
    | "holiday"
    | "break"
    | "exam_period"
    | "no_classes"
    | "follows_weekday"
    | "note";
  title: string;
  startDate: Date | string;
  endDate: Date | string;
  cancelsClasses: boolean;
  followsWeekday?: number | null; // 1=Mon..7=Sun
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
  calendarEntryId?: string;
  cancelReason?: string;
  substitutedFromDay?: DayOfWeek;
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

// 1=Monday .. 7=Sunday -> DayOfWeek
const ISO_WEEKDAY_TO_ENUM: Record<number, DayOfWeek> = {
  1: "MON",
  2: "TUE",
  3: "WED",
  4: "THU",
  5: "FRI",
  6: "SAT",
  7: "SUN",
};

export interface GenerateOccurrencesOptions {
  schedules: OccurrenceSchedule[];
  exceptions?: OccurrenceException[];
  records?: OccurrenceRecord[];
  calendarEntries?: OccurrenceCalendarEntry[];
  semesterId?: string;
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
 * respecting semester bounds, academic calendar entries (holidays, breaks,
 * exam periods, follows_weekday), effective dates, schedule exceptions,
 * and attendance record matching.
 */
export function generateOccurrences({
  schedules,
  exceptions = [],
  records = [],
  calendarEntries = [],
  semesterId,
  semesterStartDate,
  semesterEndDate,
  startDate: explicitStartDate,
  endDate: explicitEndDate,
  timezone = DEFAULT_TIMEZONE,
  now,
}: GenerateOccurrencesOptions): ClassOccurrence[] {
  const currentClock = now ?? new Date();
  const todayStr = getTodayInTimezone(timezone, currentClock);

  if (!schedules || schedules.length === 0) {
    return [];
  }

  const semStartStr = semesterStartDate ? formatDateOnly(semesterStartDate) : null;
  const semEndStr = semesterEndDate ? formatDateOnly(semesterEndDate) : null;

  let startDate = explicitStartDate ?? semStartStr ?? todayStr;
  let endDate = explicitEndDate ?? semEndStr ?? todayStr;

  if (semStartStr && startDate < semStartStr) startDate = semStartStr;
  if (semEndStr && endDate > semEndStr) endDate = semEndStr;

  if (startDate > endDate) {
    return [];
  }

  // Filter and deterministically sort calendar entries
  const normalizedEntries = calendarEntries
    .filter((entry) => {
      if (semesterId && entry.semesterId && entry.semesterId !== semesterId) {
        return false;
      }
      const eStart = formatDateOnly(entry.startDate);
      const eEnd = formatDateOnly(entry.endDate);
      if (eStart > eEnd) return false;
      if (semStartStr && eEnd < semStartStr) return false;
      if (semEndStr && eStart > semEndStr) return false;
      return true;
    })
    .map((entry) => ({
      ...entry,
      startStr: formatDateOnly(entry.startDate),
      endStr: formatDateOnly(entry.endDate),
    }))
    .sort((a, b) => {
      if (a.cancelsClasses !== b.cancelsClasses) return a.cancelsClasses ? -1 : 1;
      if (a.startStr !== b.startStr) return a.startStr.localeCompare(b.startStr);
      if (a.endStr !== b.endStr) return a.endStr.localeCompare(b.endStr);
      return a.title.localeCompare(b.title);
    });

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

  const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = endDate.split("-").map(Number);

  const startUtc = Date.UTC(startYear, startMonth - 1, startDay);
  const endUtc = Date.UTC(endYear, endMonth - 1, endDay);
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  for (let ms = startUtc; ms <= endUtc; ms += ONE_DAY_MS) {
    const cursorDate = new Date(ms);
    const dateStr = cursorDate.toISOString().slice(0, 10);
    const nativeDayOfWeek = DOW_NUMBER_TO_ENUM[cursorDate.getUTCDay()];

    const matchingEntries = normalizedEntries.filter(
      (e) => e.startStr <= dateStr && dateStr <= e.endStr
    );

    const cancellingEntry = matchingEntries.find((e) => e.cancelsClasses);
    const followsEntry = !cancellingEntry
      ? matchingEntries.find(
          (e) =>
            e.kind === "follows_weekday" &&
            e.followsWeekday != null &&
            ISO_WEEKDAY_TO_ENUM[e.followsWeekday] !== undefined
        )
      : undefined;

    const effectiveDayOfWeek = followsEntry
      ? ISO_WEEKDAY_TO_ENUM[followsEntry.followsWeekday!]
      : nativeDayOfWeek;

    for (const schedule of schedules) {
      if (schedule.dayOfWeek !== effectiveDayOfWeek) continue;

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

      let calendarEntryId: string | undefined;
      let cancelReason: string | undefined;

      // Precedence:
      // (a) Class-level ScheduleException cancelled wins
      // (b) AcademicCalendarEntry with cancelsClasses=true cancels all occurrences that day
      if (exception?.type === "cancelled") {
        status = "cancelled";
      } else if (cancellingEntry) {
        status = "cancelled";
        calendarEntryId = cancellingEntry.id;
        cancelReason = cancellingEntry.title;
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
        dayOfWeek: effectiveDayOfWeek,
        startTime,
        endTime,
        location,
        status,
        timingStatus,
        attendanceRecordId,
        exceptionId: exception?.id,
        exceptionType,
        calendarEntryId,
        cancelReason,
        substitutedFromDay: followsEntry ? nativeDayOfWeek : undefined,
        isException,
        isPast,
        isToday,
        isFuture,
      });
    }
  }

  if (legacyRecords.length > 0) {
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
        const targetOcc = matchingOccs[0];
        if (!targetOcc.attendanceRecordId) {
          targetOcc.attendanceRecordId = rec.id;
          if (targetOcc.status !== "cancelled") {
            if (rec.status === "present") targetOcc.status = "present";
            else if (rec.status === "absent") targetOcc.status = "absent";
            else if (rec.status === "cancelled") targetOcc.status = "cancelled";
            else targetOcc.status = "unmarked";
          }
        }
      } else if (matchingOccs.length > 1) {
        for (const occ of matchingOccs) {
          occ.needsReview = true;
        }
      }
    }
  }

  occurrences.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.startTime.localeCompare(b.startTime);
  });

  return occurrences;
}
