import { prisma } from "@/lib/prisma";
import { getNow } from "@/lib/clock";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";
import { currentSemesterWhere } from "@/features/semesters/lib/current";
import { generateAndPersistBrief } from "@/features/briefs/lib/generate";
import {
  buildDedupKey,
  dispatchNotifications,
  type DispatchResult,
  type NotificationCandidate,
  type PushSender,
} from "./engine";

export type NotificationType =
  | "class_start"
  | "class_end"
  | "task_due"
  | "calendar_event"
  | "morning_brief"
  | "evening_brief";

export type NotificationPriority = "critical" | "normal" | "low";

export const DEFAULT_ENABLED_TYPES: NotificationType[] = [
  "class_start",
  "class_end",
  "task_due",
  "calendar_event",
  "morning_brief",
  "evening_brief",
];

export const DEFAULT_PRIORITY: Record<NotificationType, NotificationPriority> = {
  class_start: "critical",
  class_end: "critical",
  task_due: "normal",
  calendar_event: "normal",
  morning_brief: "normal",
  evening_brief: "normal",
};

export const DEFAULT_CLASS_REMINDER_MINUTES = 10;
export const DEFAULT_EVENT_REMINDER_MINUTES = 15;
export const DEFAULT_MORNING_BRIEF_TIME = "07:00";
export const DEFAULT_EVENING_BRIEF_TIME = "20:30";
export const BRIEF_GRACE_WINDOW_MINUTES = 180; // 3 hours

export interface LocalTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dayOfWeek: number; // 0=SUN..6=SAT
  dateOnly: string; // YYYY-MM-DD
  totalMinutes: number;
}

export function getLocalTimeParts(date: Date, timezone: string): LocalTimeParts {
  const tz = timezone || DEFAULT_TIMEZONE;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const hourRaw = Number(get("hour"));
  const hour = hourRaw === 24 ? 0 : hourRaw;
  const minute = Number(get("minute"));

  const weekdayStr = get("weekday").toUpperCase().slice(0, 3);
  const weekdayMap: Record<string, number> = {
    SUN: 0,
    MON: 1,
    TUE: 2,
    WED: 3,
    THU: 4,
    FRI: 5,
    SAT: 6,
  };
  const dayOfWeek = weekdayMap[weekdayStr] ?? date.getUTCDay();
  const dateOnly = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  return {
    year,
    month,
    day,
    hour,
    minute,
    dayOfWeek,
    dateOnly,
    totalMinutes: hour * 60 + minute,
  };
}

function getDayOfWeekEnum(day: number): "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" {
  const map = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
  return map[day] ?? "MON";
}

function parseHmToMinutes(hm: string): number | null {
  const [hStr, mStr] = hm.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function localDateUtcMidnight(dateOnly: string): Date {
  return new Date(`${dateOnly}T00:00:00.000Z`);
}

/**
 * 1. Class Start Reminder (N minutes before, default 10).
 */
export async function generateClassStartCandidates(
  userId: string,
  now: Date,
  timezone: string,
  options?: { minutesBefore?: number; force?: boolean }
): Promise<NotificationCandidate[]> {
  const local = getLocalTimeParts(now, timezone);
  const dayOfWeek = getDayOfWeekEnum(local.dayOfWeek);
  const todayUtc = localDateUtcMidnight(local.dateOnly);
  const minutesBefore = options?.minutesBefore ?? DEFAULT_CLASS_REMINDER_MINUTES;

  const schedules = await prisma.classSchedule.findMany({
    where: {
      course: {
        semester: currentSemesterWhere(userId, local.dateOnly),
      },
      dayOfWeek,
      OR: [{ effectiveStartDate: null }, { effectiveStartDate: { lte: todayUtc } }],
      AND: [{ OR: [{ effectiveEndDate: null }, { effectiveEndDate: { gte: todayUtc } }] }],
    },
    include: {
      course: { select: { name: true, color: true } },
      exceptions: { where: { date: todayUtc } },
    },
  });

  const candidates: NotificationCandidate[] = [];

  for (const schedule of schedules) {
    const exception = schedule.exceptions[0];
    if (exception?.type === "cancelled") continue;

    const startTimeStr =
      exception?.type === "rescheduled" && exception.newStartTime
        ? exception.newStartTime
        : schedule.startTime;
    const targetTotal = parseHmToMinutes(startTimeStr);
    if (targetTotal === null) continue;

    const diffFromStart = targetTotal - local.totalMinutes;
    if (options?.force || (diffFromStart >= 0 && diffFromStart <= minutesBefore)) {
      const locationPart =
        exception?.type === "rescheduled" && exception.newLocation
          ? ` | ${exception.newLocation}`
          : schedule.location
          ? ` | ${schedule.location}`
          : "";

      candidates.push({
        userId,
        type: "class_start",
        entityId: schedule.id,
        occurrenceDate: local.dateOnly,
        scheduledFor: now,
        dedupKey: buildDedupKey("class_start", schedule.id, local.dateOnly),
        title: "Class Starting Soon",
        body: `${schedule.course.name} at ${startTimeStr}${locationPart}`,
        url: `/courses/${schedule.courseId}`,
        actions: [
          { action: "snooze", title: "Snooze" },
          { action: "view", title: "View Course" },
        ],
        requireInteraction: true,
      });
    }
  }

  return candidates;
}

/**
 * 2. Attendance Prompt after a class ends.
 * Once per occurrence; skipped if already marked, cancelled, or semester is not current.
 */
export async function generateClassEndCandidates(
  userId: string,
  now: Date,
  timezone: string,
  options?: { force?: boolean }
): Promise<NotificationCandidate[]> {
  const local = getLocalTimeParts(now, timezone);
  const dayOfWeek = getDayOfWeekEnum(local.dayOfWeek);
  const todayUtc = localDateUtcMidnight(local.dateOnly);

  const schedules = await prisma.classSchedule.findMany({
    where: {
      course: {
        semester: currentSemesterWhere(userId, local.dateOnly),
      },
      dayOfWeek,
      OR: [{ effectiveStartDate: null }, { effectiveStartDate: { lte: todayUtc } }],
      AND: [{ OR: [{ effectiveEndDate: null }, { effectiveEndDate: { gte: todayUtc } }] }],
    },
    include: {
      course: { select: { id: true, name: true, color: true } },
      exceptions: { where: { date: todayUtc } },
    },
  });

  const candidates: NotificationCandidate[] = [];

  for (const schedule of schedules) {
    const exception = schedule.exceptions[0];
    if (exception?.type === "cancelled") continue;

    const endTimeStr =
      exception?.type === "rescheduled" && exception.newEndTime
        ? exception.newEndTime
        : schedule.endTime;
    const targetEnd = parseHmToMinutes(endTimeStr);
    if (targetEnd === null) continue;

    const diffFromEnd = local.totalMinutes - targetEnd;
    if (options?.force || (diffFromEnd >= 0 && diffFromEnd <= 20)) {
      const existing = await prisma.attendanceRecord.findFirst({
        where: {
          courseId: schedule.courseId,
          date: todayUtc,
          OR: [{ classScheduleId: schedule.id }, { classScheduleId: null }],
        },
      });
      if (existing && existing.status !== "not_marked") continue;

      const locationPart =
        exception?.type === "rescheduled" && exception.newLocation
          ? ` | ${exception.newLocation}`
          : schedule.location
          ? ` | ${schedule.location}`
          : "";

      candidates.push({
        userId,
        type: "class_end",
        entityId: schedule.id,
        occurrenceDate: local.dateOnly,
        scheduledFor: now,
        dedupKey: buildDedupKey("class_end", schedule.id, local.dateOnly),
        title: "Class Ended",
        body: `Did you attend ${schedule.course.name}?${locationPart}`,
        url: `/courses/${schedule.courseId}`,
        data: {
          courseId: schedule.course.id,
          classScheduleId: schedule.id,
          date: local.dateOnly,
        },
        actions: [
          { action: "mark_present", title: "Present" },
          { action: "mark_absent", title: "Absent" },
          { action: "snooze", title: "Snooze" },
        ],
        requireInteraction: true,
      });
    }
  }

  return candidates;
}

/**
 * 3. Task Reminder — only for open tasks carrying an explicit time on dueDate
 * (non-midnight in user's local timezone).
 */
export async function generateTaskDueCandidates(
  userId: string,
  now: Date,
  timezone: string,
  options?: { minutesBefore?: number; force?: boolean }
): Promise<NotificationCandidate[]> {
  const local = getLocalTimeParts(now, timezone);
  const minutesBefore = options?.minutesBefore ?? 15;

  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const tasks = await prisma.task.findMany({
    where: {
      userId,
      status: "open",
      dueDate: {
        gte: windowStart,
        lte: windowEnd,
      },
    },
    include: { course: { select: { name: true } } },
  });

  const candidates: NotificationCandidate[] = [];

  for (const task of tasks) {
    if (!task.dueDate) continue;
    const dueLocal = getLocalTimeParts(task.dueDate, timezone);

    // Date-only tasks (stored at local 00:00) have no explicit reminder time
    if (dueLocal.hour === 0 && dueLocal.minute === 0) continue;
    if (dueLocal.dateOnly !== local.dateOnly) continue;

    const diffMinutes = dueLocal.totalMinutes - local.totalMinutes;
    if (options?.force || (diffMinutes >= 0 && diffMinutes <= minutesBefore)) {
      const hm = `${String(dueLocal.hour).padStart(2, "0")}:${String(dueLocal.minute).padStart(2, "0")}`;
      const coursePart = task.course ? ` · ${task.course.name}` : "";
      candidates.push({
        userId,
        type: "task_due",
        entityId: task.id,
        occurrenceDate: local.dateOnly,
        scheduledFor: task.dueDate,
        dedupKey: buildDedupKey("task_due", task.id, local.dateOnly),
        title: "Task Reminder",
        body: `${task.title} at ${hm}${coursePart}`,
        url: "/tasks",
        actions: [{ action: "view", title: "View Tasks" }],
        requireInteraction: true,
      });
    }
  }

  return candidates;
}

/**
 * 4. Calendar Event / Meeting Reminder (default 15 minutes before).
 */
export async function generateCalendarEventCandidates(
  userId: string,
  now: Date,
  timezone: string,
  options?: { minutesBefore?: number; force?: boolean }
): Promise<NotificationCandidate[]> {
  const local = getLocalTimeParts(now, timezone);
  const minutesBefore = options?.minutesBefore ?? DEFAULT_EVENT_REMINDER_MINUTES;

  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const events = await prisma.event.findMany({
    where: {
      userId,
      dateTime: {
        gte: windowStart,
        lte: windowEnd,
      },
    },
  });

  const candidates: NotificationCandidate[] = [];

  for (const event of events) {
    const eventLocal = getLocalTimeParts(event.dateTime, timezone);
    if (eventLocal.dateOnly !== local.dateOnly) continue;

    const diffMinutes = eventLocal.totalMinutes - local.totalMinutes;
    if (options?.force || (diffMinutes >= 0 && diffMinutes <= minutesBefore)) {
      const hm = `${String(eventLocal.hour).padStart(2, "0")}:${String(eventLocal.minute).padStart(2, "0")}`;
      const locationPart = event.location ? ` · ${event.location}` : "";
      candidates.push({
        userId,
        type: "calendar_event",
        entityId: event.id,
        occurrenceDate: local.dateOnly,
        scheduledFor: event.dateTime,
        dedupKey: buildDedupKey("calendar_event", event.id, local.dateOnly),
        title: event.title,
        body: `Starts at ${hm}${locationPart}`,
        url: "/calendar",
        actions: [{ action: "view", title: "View Calendar" }],
        requireInteraction: true,
      });
    }
  }

  return candidates;
}

/**
 * 5. Morning Brief (stubbed summary for Step 3; full DailyBrief storage/content added in Steps 5–8).
 */
export async function generateMorningBriefCandidates(
  userId: string,
  now: Date,
  timezone: string,
  options?: { targetTime?: string; force?: boolean }
): Promise<NotificationCandidate[]> {
  const local = getLocalTimeParts(now, timezone);
  const targetMinutes = parseHmToMinutes(options?.targetTime ?? DEFAULT_MORNING_BRIEF_TIME);
  if (targetMinutes === null) return [];

  const diff = local.totalMinutes - targetMinutes;
  if (!options?.force && (diff < 0 || diff >= BRIEF_GRACE_WINDOW_MINUTES)) {
    return [];
  }

  let body = "Your morning brief is ready.";
  try {
    const payload = await generateAndPersistBrief({
      userId,
      kind: "morning",
      now,
      timezone,
    });
    body = payload.pushSummary;
  } catch {
    // Fallback when brief dependencies are not mocked
  }

  return [
    {
      userId,
      type: "morning_brief",
      entityId: "daily",
      occurrenceDate: local.dateOnly,
      scheduledFor: now,
      dedupKey: buildDedupKey("morning_brief", "daily", local.dateOnly),
      title: "Morning Brief",
      body,
      url: "/brief",
      actions: [{ action: "view", title: "Open Brief" }],
      requireInteraction: false,
    },
  ];
}

/**
 * 6. Evening Brief.
 */
export async function generateEveningBriefCandidates(
  userId: string,
  now: Date,
  timezone: string,
  options?: { targetTime?: string; force?: boolean }
): Promise<NotificationCandidate[]> {
  const local = getLocalTimeParts(now, timezone);
  const targetMinutes = parseHmToMinutes(options?.targetTime ?? DEFAULT_EVENING_BRIEF_TIME);
  if (targetMinutes === null) return [];

  const diff = local.totalMinutes - targetMinutes;
  if (!options?.force && (diff < 0 || diff >= BRIEF_GRACE_WINDOW_MINUTES)) {
    return [];
  }

  let body = "Your evening brief for tomorrow is ready.";
  try {
    const payload = await generateAndPersistBrief({
      userId,
      kind: "evening",
      now,
      timezone,
    });
    body = payload.pushSummary;
  } catch {
    // Fallback when brief dependencies are not mocked
  }

  return [
    {
      userId,
      type: "evening_brief",
      entityId: "daily",
      occurrenceDate: local.dateOnly,
      scheduledFor: now,
      dedupKey: buildDedupKey("evening_brief", "daily", local.dateOnly),
      title: "Evening Brief",
      body,
      url: "/brief",
      actions: [{ action: "view", title: "Open Brief" }],
      requireInteraction: false,
    },
  ];
}

async function cleanupOldSentNotifications(): Promise<void> {
  try {
    const cutoff = getNow();
    cutoff.setDate(cutoff.getDate() - 7);
    await prisma.sentNotification.deleteMany({
      where: { sentAt: { lt: cutoff } },
    });
  } catch {
    // Non-critical
  }
}

export async function runNotificationScheduler(
  force: boolean = false,
  options?: {
    only?: NotificationType;
    userId?: string;
    sendPush?: PushSender;
  }
): Promise<DispatchResult> {
  const subscriptions = await prisma.pushSubscription.findMany({
    where: options?.userId ? { userId: options.userId } : undefined,
    distinct: ["userId"],
    select: { userId: true },
  });

  const activeUserIds = subscriptions.map((sub) => sub.userId);
  if (activeUserIds.length === 0) {
    return {
      sent: 0,
      deliveredPushes: 0,
      skippedDedup: 0,
      skippedDisabled: 0,
      skippedQuietHours: 0,
      skippedNoSubscription: 0,
      removedSubscriptions: 0,
      failed: 0,
    };
  }

  const now = getNow();
  const candidates: NotificationCandidate[] = [];
  const only = options?.only;

  for (const userId of activeUserIds) {
    let timezone = DEFAULT_TIMEZONE;
    let morningTime = DEFAULT_MORNING_BRIEF_TIME;
    let eveningTime = DEFAULT_EVENING_BRIEF_TIME;
    let classMinutes = DEFAULT_CLASS_REMINDER_MINUTES;
    let eventMinutes = DEFAULT_EVENT_REMINDER_MINUTES;

    try {
      const prefs = await prisma.notificationPreference.findMany({
        where: { userId },
      });
      const tzRow = prefs.find((p) => p.timezone);
      if (tzRow?.timezone) timezone = tzRow.timezone;

      const morningPref = prefs.find((p) => p.type === "morning_brief");
      if (morningPref?.dailySummaryTime) morningTime = morningPref.dailySummaryTime;

      const eveningPref = prefs.find((p) => p.type === "evening_brief");
      if (eveningPref?.dailySummaryTime) eveningTime = eveningPref.dailySummaryTime;

      const classPref = prefs.find((p) => p.type === "class_start");
      if (classPref?.reminderMinutes != null) classMinutes = classPref.reminderMinutes;

      const eventPref = prefs.find((p) => p.type === "calendar_event");
      if (eventPref?.reminderMinutes != null) eventMinutes = eventPref.reminderMinutes;
    } catch {
      // Fallback to defaults
    }

    if (!only || only === "class_start") {
      candidates.push(
        ...(await generateClassStartCandidates(userId, now, timezone, {
          minutesBefore: classMinutes,
          force,
        }))
      );
    }
    if (!only || only === "class_end") {
      candidates.push(...(await generateClassEndCandidates(userId, now, timezone, { force })));
    }
    if (!only || only === "task_due") {
      candidates.push(...(await generateTaskDueCandidates(userId, now, timezone, { force })));
    }
    if (!only || only === "calendar_event") {
      candidates.push(
        ...(await generateCalendarEventCandidates(userId, now, timezone, {
          minutesBefore: eventMinutes,
          force,
        }))
      );
    }
    if (!only || only === "morning_brief") {
      candidates.push(
        ...(await generateMorningBriefCandidates(userId, now, timezone, {
          targetTime: morningTime,
          force,
        }))
      );
    }
    if (!only || only === "evening_brief") {
      candidates.push(
        ...(await generateEveningBriefCandidates(userId, now, timezone, {
          targetTime: eveningTime,
          force,
        }))
      );
    }
  }

  const result = await dispatchNotifications(candidates, {
    now,
    sendPush: options?.sendPush,
  });
  await cleanupOldSentNotifications();
  return result;
}
