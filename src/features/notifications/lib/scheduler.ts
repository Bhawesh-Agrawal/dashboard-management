import { prisma } from "@/lib/prisma";
import { getActiveSubscriptions } from "./subscription";
import {
  computeAttendancePercent,
} from "@/features/assessments/lib/calculations";

/**
 * Notification types that can be scheduled.
 */
export type NotificationType =
  | "routine_reminder"
  | "task_due"
  | "class_start"
  | "assessment"
  | "daily_summary"
  | "missed_routine"
  | "overdue_task"
  | "review_daily"
  | "review_weekly"
  | "review_monthly"
  | "class_end"
  | "class_cancelled"
  | "class_rescheduled";

export type NotificationPriority = "critical" | "normal" | "low";

/**
 * Lean starter set — new users get only these ON.
 */
export const DEFAULT_ENABLED_TYPES: NotificationType[] = [
  "daily_summary",
  "overdue_task",
  "class_start",
  "review_weekly",
];

/**
 * Priority tier per type (overridable per-user via NotificationPreference).
 */
export const DEFAULT_PRIORITY: Record<NotificationType, NotificationPriority> = {
  class_start: "critical",
  class_end: "critical",
  class_cancelled: "critical",
  class_rescheduled: "critical",
  overdue_task: "critical",
  daily_summary: "normal",
  task_due: "normal",
  assessment: "normal",
  routine_reminder: "normal",
  missed_routine: "normal",
  review_daily: "normal",
  review_weekly: "low",
  review_monthly: "low",
};

/**
 * Notification data structure for push messages.
 */
export type NotificationPayload = {
  userId: string;
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag: string;
  data: {
    url: string;
    type: NotificationType;
    types?: NotificationType[];
    individualUrls?: Record<string, string>;
    [key: string]: string | number | boolean | string[] | Record<string, string> | undefined;
  };
  actions?: { action: string; title: string }[];
  requireInteraction?: boolean;
};

/**
 * Get notification preferences for a user.
 * Returns empty array if table doesn't exist.
 */
async function getPreferences(userId: string) {
  try {
    return await prisma.notificationPreference.findMany({
      where: { userId },
    });
  } catch {
    // Table may not exist yet
    return [];
  }
}

/**
 * Check if a notification type is enabled.
 * Defaults to the lean starter set (opt-in rather than opt-out).
 */
async function isTypeEnabled(
  userId: string,
  type: NotificationType
): Promise<boolean> {
  const prefs = await getPreferences(userId);
  const pref = prefs.find((p) => p.type === type);
  if (pref) return pref.enabled;
  return DEFAULT_ENABLED_TYPES.includes(type);
}

/**
 * Check if current time falls within the user's quiet hours window.
 * Quiet hours wrap around midnight (e.g. 22:00–07:00).
 * Returns false if no quiet hours are configured or if the type is critical.
 */
function isWithinQuietHours(
  localHour: number,
  localMinute: number,
  start: string | null | undefined,
  end: string | null | undefined
): boolean {
  if (!start || !end) return false;

  const [startH, startM] = start.split(":").map(Number);
  const [endH, endM] = end.split(":").map(Number);
  const current = localHour * 60 + localMinute;
  const startMin = startH * 60 + startM;
  const endMin = endH * 60 + endM;

  if (startMin <= endMin) {
    // Same-day window (e.g. 09:00–17:00)
    return current >= startMin && current < endMin;
  }
  // Wraps midnight (e.g. 22:00–07:00)
  return current >= startMin || current < endMin;
}

/**
 * Get the effective priority for a notification type.
 * Uses user override from pref, falling back to DEFAULT_PRIORITY.
 */
function getEffectivePriority(
  prefs: { type: string; priority?: string | null }[],
  type: NotificationType
): NotificationPriority {
  const pref = prefs.find((p) => p.type === type);
  return (pref?.priority as NotificationPriority) || DEFAULT_PRIORITY[type];
}

// ─── Notification Dedup ──────────────────────────────────
// Prevents sending the same notification multiple times.

async function wasNotificationSent(userId: string, tag: string): Promise<boolean> {
  try {
    const existing = await prisma.sentNotification.findUnique({
      where: { userId_tag: { userId, tag } },
    });
    if (!existing) return false;
    // Check if snoozed until a future time
    if (existing.snoozedUntil && existing.snoozedUntil > new Date()) {
      return true; // Treat snoozed as "sent" to prevent re-triggering
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a notification is snoozed (user tapped snooze to suppress until class starts).
 */
async function isNotificationSnoozed(userId: string, tag: string): Promise<boolean> {
  try {
    const existing = await prisma.sentNotification.findUnique({
      where: { userId_tag: { userId, tag } },
    });
    if (!existing || !existing.snoozedUntil) return false;
    return existing.snoozedUntil > new Date();
  } catch {
    return false;
  }
}

async function markNotificationSent(userId: string, tag: string, type: string): Promise<void> {
  try {
    await prisma.sentNotification.upsert({
      where: { userId_tag: { userId, tag } },
      create: { userId, tag, type },
      update: { sentAt: new Date() },
    });
  } catch {
    // Non-critical — don't break scheduler
  }
}

async function cleanupOldSentNotifications(): Promise<void> {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    await prisma.sentNotification.deleteMany({
      where: { sentAt: { lt: cutoff } },
    });
  } catch {
    // Non-critical
  }
}

// ─── Time-of-day window defaults ───────────────────────────
// Used for routines that have a timeOfDay but no specificTime.
const TIME_OF_DAY_DEFAULTS: Record<string, string> = {
  morning: "07:00",
  afternoon: "13:00",
  evening: "18:00",
  anytime: "09:00",
};

/**
 * Get the user's current time based on their timezone preference.
 * Falls back to server local time if no timezone is configured.
 */
function getUserLocalTime(timezone: string | null | undefined): Date {
  // If no timezone set, try to detect from server's local timezone
  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  try {
    const now = new Date();
    // Format current UTC time in the user's timezone
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const get = (type: string) =>
      parts.find((p) => p.type === type)?.value || "0";

    const localDate = new Date(
      parseInt(get("year")),
      parseInt(get("month")) - 1,
      parseInt(get("day")),
      parseInt(get("hour")),
      parseInt(get("minute")),
      parseInt(get("second"))
    );
    return localDate;
  } catch {
    return new Date();
  }
}

/**
 * Check if current time is within a window of a target time (in minutes).
 * Returns true if currentTime is within [targetTime, targetTime + windowMinutes).
 */
let forceNotifications = false;

function isWithinTimeWindow(
  currentHour: number,
  currentMinutes: number,
  targetTime: string,
  windowMinutes: number = 5
): boolean {
  if (forceNotifications) return true;
  const [targetHour, targetMin] = targetTime.split(":").map(Number);
  const currentTotal = currentHour * 60 + currentMinutes;
  const targetTotal = targetHour * 60 + targetMin;
  const diff = currentTotal - targetTotal;
  return diff >= 0 && diff < windowMinutes;
}

/**
 * Generate routine reminder notifications for the current time window.
 * Handles both routines with specificTime and routines with only timeOfDay.
 */
async function generateRoutineReminders(
  userId: string,
  userLocalTime: Date
): Promise<NotificationPayload[]> {
  const currentHour = userLocalTime.getHours();
  const currentMinutes = userLocalTime.getMinutes();
  const dayOfWeek = getDayOfWeekEnum(userLocalTime.getDay()) as
    | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

  const notifications: NotificationPayload[] = [];

  // Find all routines active today
  const routines = await prisma.routine.findMany({
    where: {
      userId,
      activeDays: { has: dayOfWeek },
    },
  });

  for (const routine of routines) {
    // Determine the effective trigger time
    const triggerTime = routine.specificTime
      || TIME_OF_DAY_DEFAULTS[routine.timeOfDay]
      || "09:00";

    if (isWithinTimeWindow(currentHour, currentMinutes, triggerTime)) {
      const timeLabel = routine.specificTime
        ? `Scheduled for ${routine.specificTime}`
        : `${routine.timeOfDay.charAt(0).toUpperCase() + routine.timeOfDay.slice(1)} routine`;

      notifications.push({
        userId,
        title: "Routine Reminder",
        body: `${routine.name} — ${timeLabel}`,
        tag: `routine-${routine.id}`,
        data: {
          url: "/routines",
          type: "routine_reminder",
        },
        actions: [{ action: "view", title: "View Routines" }],
        requireInteraction: true,
      });
    }
  }

  return notifications;
}

/**
 * Generate task due-date notifications.
 * Triggers at 09:00 in the user's local time.
 */
async function generateTaskNotifications(
  userId: string,
  userLocalTime: Date
): Promise<NotificationPayload[]> {
  // Only trigger at 09:00
  if (!isWithinTimeWindow(userLocalTime.getHours(), userLocalTime.getMinutes(), "09:00")) {
    return [];
  }

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(23, 59, 59, 999);

  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const notifications: NotificationPayload[] = [];

  // Find tasks due today or tomorrow
  const tasks = await prisma.task.findMany({
    where: {
      status: "open",
      dueDate: {
        gte: now,
        lte: tomorrow,
      },
      OR: [{ userId }, { userId: null }],
    },
    include: { course: { select: { name: true } } },
    orderBy: { priority: "asc" },
  });

  if (tasks.length === 0) return [];

  // Group tasks by due date for better formatting
  const todayTasks = tasks.filter(t => new Date(t.dueDate!).toDateString() === now.toDateString());
  const tomorrowTasks = tasks.filter(t => new Date(t.dueDate!).toDateString() === tomorrow.toDateString());

  // Format today's tasks
  if (todayTasks.length > 0) {
    const lines = todayTasks.map(task => {
      const coursePart = task.course ? ` | ${task.course.name}` : "";
      const priorityLabel = task.priority === 1 ? " [HIGH]" : task.priority === 2 ? " [MED]" : "";
      return `- ${task.title}${coursePart}${priorityLabel}`;
    });

    notifications.push({
      userId,
      title: `${todayTasks.length} Task${todayTasks.length > 1 ? "s" : ""} Due Today`,
      body: lines.join("\n"),
      tag: "tasks-due-today",
      data: {
        url: "/tasks",
        type: "task_due",
      },
      actions: [
        { action: "view", title: "View Tasks" }
      ],
      requireInteraction: true,
    });
  }

  // Format tomorrow's tasks
  if (tomorrowTasks.length > 0) {
    const lines = tomorrowTasks.map(task => {
      const coursePart = task.course ? ` | ${task.course.name}` : "";
      const priorityLabel = task.priority === 1 ? " [HIGH]" : task.priority === 2 ? " [MED]" : "";
      return `- ${task.title}${coursePart}${priorityLabel}`;
    });

    notifications.push({
      userId,
      title: `${tomorrowTasks.length} Task${tomorrowTasks.length > 1 ? "s" : ""} Due Tomorrow`,
      body: lines.join("\n"),
      tag: "tasks-due-tomorrow",
      data: {
        url: "/tasks",
        type: "task_due",
      },
      actions: [
        { action: "view", title: "View Tasks" }
      ],
      requireInteraction: true,
    });
  }

  return notifications;
}

/**
 * Generate class start notifications.
 * Checks for schedule exceptions, date range, and dedup before generating.
 */
async function generateClassNotifications(
  userId: string,
  userLocalTime: Date
): Promise<NotificationPayload[]> {
  const currentHour = userLocalTime.getHours();
  const currentMinutes = userLocalTime.getMinutes();
  const dayOfWeek = getDayOfWeekEnum(userLocalTime.getDay());
  const today = new Date(userLocalTime);
  today.setHours(0, 0, 0, 0);

  const notifications: NotificationPayload[] = [];

  // Find classes scheduled today with date range filtering
  const schedules = await prisma.classSchedule.findMany({
    where: {
      course: {
        semester: {
          OR: [{ userId }, { userId: null }],
          isActive: true,
        },
      },
      dayOfWeek: dayOfWeek as "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN",
      OR: [
        { effectiveStartDate: null },
        { effectiveStartDate: { lte: today } },
      ],
      AND: [
        { OR: [{ effectiveEndDate: null }, { effectiveEndDate: { gte: today } }] },
      ],
    },
    include: {
      course: { select: { name: true, color: true } },
      exceptions: { where: { date: today } },
    },
  });

  for (const schedule of schedules) {
    // Skip cancelled classes
    const exception = schedule.exceptions[0];
    if (exception?.type === "cancelled") continue;

    // Use rescheduled start time if available
    const startTimeStr = exception?.type === "rescheduled" && exception.newStartTime
      ? exception.newStartTime
      : schedule.startTime;

    const [hours, minutes] = startTimeStr.split(":").map(Number);
    const targetTotal = hours * 60 + minutes;
    const currentTotal = currentHour * 60 + currentMinutes;
    
    // Trigger if within 20 mins before class or at class start time.
    const diffFromStart = targetTotal - currentTotal;

    if (diffFromStart >= 0 && diffFromStart <= 20) {
      const tag = `class-${schedule.id}`;
      const todayStr = userLocalTime.toISOString().split("T")[0];
      const fullTag = `${tag}-${todayStr}`;

      // Skip if already sent today for this class
      if (await wasNotificationSent(userId, fullTag)) continue;

      // Skip if snoozed (user tapped snooze)
      if (await isNotificationSnoozed(userId, fullTag)) continue;

      const locationPart = exception?.type === "rescheduled" && exception.newLocation
        ? ` | ${exception.newLocation}`
        : schedule.location
          ? ` | ${schedule.location}`
          : "";

      notifications.push({
        userId,
        title: "Class Starting Soon",
        body: `${schedule.course.name} at ${startTimeStr}${locationPart}`,
        tag: fullTag,
        data: {
          url: `/courses/${schedule.courseId}`,
          type: "class_start",
        },
        actions: [
          { action: "snooze", title: "Snooze" },
          { action: "view", title: "View Course" }
        ],
        requireInteraction: true,
      });
    }
  }

  return notifications;
}

/**
 * Generate class end notifications for marking attendance.
 * Checks for existing attendance, schedule exceptions, and dedup before generating.
 */
async function generateClassEndNotifications(
  userId: string,
  userLocalTime: Date
): Promise<NotificationPayload[]> {
  const currentHour = userLocalTime.getHours();
  const currentMinutes = userLocalTime.getMinutes();
  const currentTotal = currentHour * 60 + currentMinutes;
  const dayOfWeek = getDayOfWeekEnum(userLocalTime.getDay());
  const today = new Date(userLocalTime);
  today.setHours(0, 0, 0, 0);

  const notifications: NotificationPayload[] = [];

  // Find classes scheduled today with date range filtering
  const schedules = await prisma.classSchedule.findMany({
    where: {
      course: {
        semester: {
          OR: [{ userId }, { userId: null }],
          isActive: true,
        },
      },
      dayOfWeek: dayOfWeek as "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN",
      OR: [
        { effectiveStartDate: null },
        { effectiveStartDate: { lte: today } },
      ],
      AND: [
        { OR: [{ effectiveEndDate: null }, { effectiveEndDate: { gte: today } }] },
      ],
    },
    include: {
      course: { select: { id: true, name: true, color: true } },
      exceptions: { where: { date: today } },
    },
  });

  const todayStr = userLocalTime.toISOString().split("T")[0];

  for (const schedule of schedules) {
    // Skip cancelled classes
    const exception = schedule.exceptions[0];
    if (exception?.type === "cancelled") continue;

    // Use rescheduled times if available, otherwise use original
    const endTimeStr = exception?.type === "rescheduled" && exception.newEndTime
      ? exception.newEndTime
      : schedule.endTime;
    const [hours, minutes] = endTimeStr.split(":").map(Number);
    const targetEndTime = hours * 60 + minutes;
    const diffFromEnd = currentTotal - targetEndTime;

    // Trigger if current time is within 20 minutes AFTER the class end time (or up to 2 mins before).
    if (diffFromEnd >= -2 && diffFromEnd <= 20) {
      const tag = `attendance-${schedule.id}-${todayStr}`;

      // Skip if already sent (includes snoozed check)
      if (await wasNotificationSent(userId, tag)) continue;

      // Skip if snoozed (user tapped snooze)
      if (await isNotificationSnoozed(userId, tag)) continue;

      // Skip if attendance already recorded for this course+date
      const existing = await prisma.attendanceRecord.findUnique({
        where: { courseId_date: { courseId: schedule.courseId, date: today } },
      });
      if (existing && existing.status !== "not_marked") continue;

      const locationPart = exception?.type === "rescheduled" && exception.newLocation
        ? ` | ${exception.newLocation}`
        : schedule.location
          ? ` | ${schedule.location}`
          : "";

      notifications.push({
        userId,
        title: "Class Ended",
        body: `Did you attend ${schedule.course.name}?${locationPart}`,
        tag,
        data: {
          url: `/courses/${schedule.courseId}`,
          type: "class_end",
          courseId: schedule.course.id,
          date: todayStr,
        },
        actions: [
          { action: "mark_present", title: "Present" },
          { action: "mark_absent", title: "Absent" },
          { action: "snooze", title: "Snooze" }
        ],
        requireInteraction: true,
      });
    }
  }

  return notifications;
}

/**
 * Generate class cancellation notifications.
 * Notifies users when a class is cancelled via schedule exception.
 */
async function generateClassCancellationNotifications(
  userId: string,
  userLocalTime: Date
): Promise<NotificationPayload[]> {
  const dayOfWeek = getDayOfWeekEnum(userLocalTime.getDay());
  const today = new Date(userLocalTime);
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];

  const notifications: NotificationPayload[] = [];

  // Find cancelled class exceptions for today
  const cancelledExceptions = await prisma.scheduleException.findMany({
    where: {
      type: "cancelled",
      date: today,
      classSchedule: {
        course: {
          semester: {
            OR: [{ userId }, { userId: null }],
            isActive: true,
          },
        },
      },
    },
    include: {
      classSchedule: {
        include: {
          course: { select: { id: true, name: true } },
        },
      },
    },
  });

  for (const exception of cancelledExceptions) {
    const tag = `cancelled-${exception.classScheduleId}-${todayStr}`;

    // Skip if already sent
    if (await wasNotificationSent(userId, tag)) continue;

    // Skip if snoozed
    if (await isNotificationSnoozed(userId, tag)) continue;

    notifications.push({
      userId,
      title: "Class Cancelled",
      body: `${exception.classSchedule.course.name} has been cancelled for today`,
      tag,
      data: {
        url: `/courses/${exception.classSchedule.courseId}`,
        type: "class_cancelled",
      },
      actions: [{ action: "view", title: "View Course" }],
      requireInteraction: true,
    });
  }

  return notifications;
}

/**
 * Generate class reschedule notifications.
 * Notifies users when a class is rescheduled via schedule exception.
 */
async function generateClassRescheduleNotifications(
  userId: string,
  userLocalTime: Date
): Promise<NotificationPayload[]> {
  const dayOfWeek = getDayOfWeekEnum(userLocalTime.getDay());
  const today = new Date(userLocalTime);
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];

  const notifications: NotificationPayload[] = [];

  // Find rescheduled exceptions for today
  const rescheduledExceptions = await prisma.scheduleException.findMany({
    where: {
      type: "rescheduled",
      date: today,
      classSchedule: {
        course: {
          semester: {
            OR: [{ userId }, { userId: null }],
            isActive: true,
          },
        },
      },
    },
    include: {
      classSchedule: {
        include: {
          course: { select: { id: true, name: true } },
        },
      },
    },
  });

  for (const exception of rescheduledExceptions) {
    const tag = `rescheduled-${exception.classScheduleId}-${todayStr}`;

    // Skip if already sent
    if (await wasNotificationSent(userId, tag)) continue;

    // Skip if snoozed
    if (await isNotificationSnoozed(userId, tag)) continue;

    const timeChange = exception.newStartTime
      ? ` from ${exception.classSchedule.startTime} to ${exception.newStartTime}`
      : "";
    const locationChange = exception.newLocation
      ? ` at ${exception.newLocation}`
      : "";

    notifications.push({
      userId,
      title: "Class Rescheduled",
      body: `${exception.classSchedule.course.name}${timeChange}${locationChange}`,
      tag,
      data: {
        url: `/courses/${exception.classSchedule.courseId}`,
        type: "class_rescheduled",
      },
      actions: [{ action: "view", title: "View Course" }],
      requireInteraction: true,
    });
  }

  return notifications;
}

/**
 * Generate assessment reminder notifications.
 * Triggers at 09:00 in the user's local time.
 */
async function generateAssessmentNotifications(
  userId: string,
  userLocalTime: Date
): Promise<NotificationPayload[]> {
  // Only trigger at 09:00
  if (!isWithinTimeWindow(userLocalTime.getHours(), userLocalTime.getMinutes(), "09:00")) {
    return [];
  }

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(23, 59, 59, 999);

  const notifications: NotificationPayload[] = [];

  const assessments = await prisma.assessment.findMany({
    where: {
      course: { semester: { userId, isActive: true } },
      date: { gte: now, lte: tomorrow },
      obtainedMarks: null,
    },
    include: { course: { select: { name: true } } },
  });

  for (const assessment of assessments) {
    const dueDate = new Date(assessment.date!);
    const isToday = dueDate.toDateString() === now.toDateString();

    notifications.push({
      userId,
      title: isToday ? "Assessment Today" : "Assessment Tomorrow",
      body: `${assessment.componentType.replace("_", "/")} — ${assessment.course.name}`,
      tag: `assessment-${assessment.id}`,
      data: {
        url: `/courses/${assessment.courseId}`,
        type: "assessment",
      },
      actions: [{ action: "view", title: "View" }],
      requireInteraction: true,
    });
  }

  return notifications;
}

/**
 * Generate missed routine notifications.
 * Runs at 21:00 — checks for routines active today that were never completed.
 */
async function generateMissedRoutineNotifications(
  userId: string,
  userLocalTime: Date
): Promise<NotificationPayload[]> {
  // Only trigger at 21:00
  if (!isWithinTimeWindow(userLocalTime.getHours(), userLocalTime.getMinutes(), "21:00")) {
    return [];
  }

  const today = new Date(userLocalTime);
  today.setHours(0, 0, 0, 0);

  const dayOfWeek = getDayOfWeekEnum(userLocalTime.getDay()) as
    | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

  // Get all routines active today
  const routines = await prisma.routine.findMany({
    where: {
      userId,
      activeDays: { has: dayOfWeek },
    },
  });

  if (routines.length === 0) return [];

  // Get today's completions for these routines
  const todayStart = new Date(today);
  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);

  let completions: { routineId: string }[] = [];
  try {
    completions = await prisma.routineCompletion.findMany({
      where: {
        routineId: { in: routines.map((r) => r.id) },
        date: { gte: todayStart, lte: todayEnd },
      },
      select: { routineId: true },
    });
  } catch {
    completions = [];
  }

  const completedIds = new Set(completions.map((c) => c.routineId));
  const missedRoutines = routines.filter((r) => !completedIds.has(r.id));

  if (missedRoutines.length === 0) return [];

  // Get streak info for context
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  let streakCompletions: { routineId: string; date: Date }[] = [];
  try {
    streakCompletions = await prisma.routineCompletion.findMany({
      where: {
        routineId: { in: missedRoutines.map((r) => r.id) },
        date: { gte: thirtyDaysAgo },
      },
      select: { routineId: true, date: true },
      orderBy: { date: "desc" },
    });
  } catch {
    streakCompletions = [];
  }

  // Count recent completions per routine as rough streak indicator
  const streakCounts = new Map<string, number>();
  for (const c of streakCompletions) {
    streakCounts.set(c.routineId, (streakCounts.get(c.routineId) || 0) + 1);
  }

  // Build detailed body
  const lines: string[] = [];
  for (const routine of missedRoutines) {
    const streak = streakCounts.get(routine.id) || 0;
    const timeLabel = routine.specificTime || routine.timeOfDay;
    const streakPart = streak > 0 ? ` (${streak}-day streak at risk)` : "";
    lines.push(`- ${routine.name} [${timeLabel}]${streakPart}`);
  }

  return [
    {
      userId,
      title: `${missedRoutines.length} Routine${missedRoutines.length > 1 ? "s" : ""} Incomplete Today`,
      body: lines.join("\n"),
      tag: "missed-routines",
      data: {
        url: "/routines",
        type: "missed_routine",
      },
      actions: [{ action: "view", title: "Complete Now" }],
      requireInteraction: true,
    },
  ];
}

/**
 * Generate overdue task notifications.
 * Runs at 10:00 — lists open tasks whose due date has already passed.
 */
async function generateOverdueTaskNotifications(
  userId: string,
  userLocalTime: Date
): Promise<NotificationPayload[]> {
  // Only trigger at 10:00
  if (!isWithinTimeWindow(userLocalTime.getHours(), userLocalTime.getMinutes(), "10:00")) {
    return [];
  }

  const now = new Date();

  const overdueTasks = await prisma.task.findMany({
    where: {
      status: "open",
      dueDate: { lt: now },
      OR: [{ userId }, { userId: null }],
    },
    include: { course: { select: { name: true } } },
    orderBy: { dueDate: "asc" },
    take: 10, // Cap to avoid overly long notifications
  });

  if (overdueTasks.length === 0) return [];

  // Group by severity (1-3 days, 4-7 days, 7+ days)
  const recent = overdueTasks.filter(t => {
    const days = Math.ceil((now.getTime() - new Date(t.dueDate!).getTime()) / (1000 * 60 * 60 * 24));
    return days <= 3;
  });
  const moderate = overdueTasks.filter(t => {
    const days = Math.ceil((now.getTime() - new Date(t.dueDate!).getTime()) / (1000 * 60 * 60 * 24));
    return days > 3 && days <= 7;
  });
  const severe = overdueTasks.filter(t => {
    const days = Math.ceil((now.getTime() - new Date(t.dueDate!).getTime()) / (1000 * 60 * 60 * 24));
    return days > 7;
  });

  const lines: string[] = [];
  
  if (recent.length > 0) {
    lines.push(`Recent (1-3 days):`);
    for (const task of recent.slice(0, 3)) {
      const daysOverdue = Math.ceil((now.getTime() - new Date(task.dueDate!).getTime()) / (1000 * 60 * 60 * 24));
      const coursePart = task.course ? ` | ${task.course.name}` : "";
      lines.push(`- ${task.title} (${daysOverdue}d overdue${coursePart})`);
    }
  }

  if (moderate.length > 0) {
    lines.push(`Moderate (4-7 days):`);
    for (const task of moderate.slice(0, 3)) {
      const daysOverdue = Math.ceil((now.getTime() - new Date(task.dueDate!).getTime()) / (1000 * 60 * 60 * 24));
      const coursePart = task.course ? ` | ${task.course.name}` : "";
      lines.push(`- ${task.title} (${daysOverdue}d overdue${coursePart})`);
    }
  }

  if (severe.length > 0) {
    lines.push(`Critical (7+ days):`);
    for (const task of severe.slice(0, 3)) {
      const daysOverdue = Math.ceil((now.getTime() - new Date(task.dueDate!).getTime()) / (1000 * 60 * 60 * 24));
      const coursePart = task.course ? ` | ${task.course.name}` : "";
      lines.push(`- ${task.title} (${daysOverdue}d overdue${coursePart})`);
    }
  }

  return [
    {
      userId,
      title: `${overdueTasks.length} Overdue Task${overdueTasks.length > 1 ? "s" : ""}`,
      body: lines.join("\n"),
      tag: "overdue-tasks",
      data: {
        url: "/tasks",
        type: "overdue_task",
      },
      actions: [{ action: "view", title: "View Tasks" }],
      requireInteraction: true,
    },
  ];
}

type DailySummarySection =
  | "classes"
  | "tasks"
  | "routines"
  | "deadlines"
  | "attendance"
  | "tomorrow_classes";

/**
 * Generate the daily summary digest.
 * Respects user's dailySummaryTime, timezone, and dailySummarySections preferences.
 * Produces a detailed, multi-line notification with actionable content.
 */
async function generateDailySummary(userId: string): Promise<NotificationPayload[]> {
  // Fetch user's daily summary preferences
  let preferredTime = "19:00";
  let sections: DailySummarySection[] = [
    "classes", "tasks", "routines", "deadlines", "attendance", "tomorrow_classes",
  ];
  let timezone: string | null = null;

  try {
    const pref = await prisma.notificationPreference.findUnique({
      where: {
        userId_type: {
          userId,
          type: "daily_summary",
        },
      },
    });

    if (pref) {
      preferredTime = pref.dailySummaryTime || "19:00";
      sections = (pref.dailySummarySections as DailySummarySection[]) || sections;
      timezone = pref.timezone || null;
    }
  } catch {
    // Table may not exist yet — use defaults
  }

  // Use timezone-aware local time for the time window check
  const userLocalTime = getUserLocalTime(timezone);
  const currentHour = userLocalTime.getHours();
  const currentMinutes = userLocalTime.getMinutes();

  if (!isWithinTimeWindow(currentHour, currentMinutes, preferredTime)) {
    return [];
  }

  const now = new Date();
  const dayOfWeek = getDayOfWeekEnum(userLocalTime.getDay());

  // Build detailed summary body section by section
  const blocks: string[] = [];

  // ─── Today's Classes ─────────────────────────────────────
  if (sections.includes("classes")) {
    const classes = await prisma.classSchedule.findMany({
      where: {
        course: { semester: { userId, isActive: true } },
        dayOfWeek: dayOfWeek as "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN",
      },
      include: { course: { select: { name: true } } },
      orderBy: { startTime: "asc" },
    });
    if (classes.length > 0) {
      const header = `Today's Classes (${classes.length})`;
      const items = classes.map((c) => {
        const loc = c.location ? `, ${c.location}` : "";
        return `  ${c.course.name} at ${c.startTime}${loc}`;
      });
      blocks.push([header, ...items].join("\n"));
    }
  }

  // ─── Pending Tasks ───────────────────────────────────────
  if (sections.includes("tasks")) {
    const tasks = await prisma.task.findMany({
      where: { status: "open", starred: true, OR: [{ userId }, { userId: null }] },
      include: { course: { select: { name: true } } },
      orderBy: { priority: "asc" },
      take: 5,
    });

    // Also get total open count
    const totalOpen = await prisma.task.count({
      where: { status: "open", OR: [{ userId }, { userId: null }] },
    });

    if (tasks.length > 0 || totalOpen > 0) {
      const header = `Pending Tasks (${totalOpen} open, ${tasks.length} starred)`;
      const items = tasks.map((t) => {
        const duePart = t.dueDate
          ? `, due ${formatShortDate(new Date(t.dueDate))}`
          : "";
        const coursePart = t.course ? ` | ${t.course.name}` : "";
        return `  ${t.title} (P${t.priority}${duePart}${coursePart})`;
      });
      blocks.push([header, ...items].join("\n"));
    }
  }

  // ─── Routines ────────────────────────────────────────────
  if (sections.includes("routines")) {
    const routines = await prisma.routine.findMany({
      where: {
        userId,
        activeDays: {
          has: dayOfWeek as "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN",
        },
      },
      orderBy: { timeOfDay: "asc" },
    });

    if (routines.length > 0) {
      // Check today's completions
      const todayStart = new Date(userLocalTime);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(userLocalTime);
      todayEnd.setHours(23, 59, 59, 999);

      let completions: { routineId: string }[] = [];
      try {
        completions = await prisma.routineCompletion.findMany({
          where: {
            routineId: { in: routines.map((r) => r.id) },
            date: { gte: todayStart, lte: todayEnd },
          },
          select: { routineId: true },
        });
      } catch {
        completions = [];
      }

      const completedIds = new Set(completions.map((c) => c.routineId));

      // Get streak data
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      let streakCompletions: { routineId: string }[] = [];
      try {
        streakCompletions = await prisma.routineCompletion.findMany({
          where: {
            routineId: { in: routines.map((r) => r.id) },
            date: { gte: thirtyDaysAgo },
          },
          select: { routineId: true },
        });
      } catch {
        streakCompletions = [];
      }
      const streakCounts = new Map<string, number>();
      for (const c of streakCompletions) {
        streakCounts.set(c.routineId, (streakCounts.get(c.routineId) || 0) + 1);
      }

      const completed = routines.filter((r) => completedIds.has(r.id)).length;
      const header = `Routines (${completed}/${routines.length} done)`;
      const items = routines.map((r) => {
        const status = completedIds.has(r.id) ? "[done]" : "[pending]";
        const time = r.specificTime || r.timeOfDay;
        const streak = streakCounts.get(r.id) || 0;
        const streakPart = streak > 0 ? ` — ${streak}-day streak` : "";
        return `  ${r.name} (${time}) ${status}${streakPart}`;
      });
      blocks.push([header, ...items].join("\n"));
    }
  }

  // ─── Attendance Alerts ───────────────────────────────────
  if (sections.includes("attendance")) {
    const activeSemester = await prisma.semester.findFirst({
      where: { userId, isActive: true },
    });

    if (activeSemester) {
      const courses = await prisma.course.findMany({
        where: { semesterId: activeSemester.id },
        include: { attendanceRecords: true },
      });

      const alerts: string[] = [];
      for (const course of courses) {
        const present = course.attendanceRecords.filter(
          (r) => r.status === "present"
        ).length;
        const absent = course.attendanceRecords.filter(
          (r) => r.status === "absent"
        ).length;
        const percent = computeAttendancePercent(present, absent);

        if (percent < 75 && present + absent > 0) {
          alerts.push(`  ${course.name}: ${percent.toFixed(1)}% (below 75%)`);
        }
      }

      if (alerts.length > 0) {
        const header = `Attendance Alerts (${alerts.length})`;
        blocks.push([header, ...alerts].join("\n"));
      }
    }
  }

  // ─── Upcoming Deadlines ──────────────────────────────────
  if (sections.includes("deadlines")) {
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);

    const upcomingTasks = await prisma.task.findMany({
      where: {
        status: "open",
        dueDate: { gte: now, lte: nextWeek },
        OR: [{ userId }, { userId: null }],
      },
      include: { course: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
      take: 8,
    });

    if (upcomingTasks.length > 0) {
      const header = `Deadlines This Week (${upcomingTasks.length})`;
      const items = upcomingTasks.map((t) => {
        const coursePart = t.course ? ` | ${t.course.name}` : "";
        return `  ${t.title} — due ${formatShortDate(new Date(t.dueDate!))}${coursePart}`;
      });
      blocks.push([header, ...items].join("\n"));
    }
  }

  // ─── Tomorrow's Classes ──────────────────────────────────
  if (sections.includes("tomorrow_classes")) {
    const tomorrowDate = new Date(userLocalTime);
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowDay = getDayOfWeekEnum(tomorrowDate.getDay());

    const tomorrowClasses = await prisma.classSchedule.findMany({
      where: {
        course: { semester: { userId, isActive: true } },
        dayOfWeek: tomorrowDay as "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN",
      },
      include: { course: { select: { name: true } } },
      orderBy: { startTime: "asc" },
    });

    if (tomorrowClasses.length > 0) {
      const dayLabel = tomorrowDate.toLocaleDateString("en-US", { weekday: "long" });
      const header = `Tomorrow's Classes — ${dayLabel} (${tomorrowClasses.length})`;
      const items = tomorrowClasses.map((c) => {
        const loc = c.location ? `, ${c.location}` : "";
        return `  ${c.course.name} at ${c.startTime}${loc}`;
      });
      blocks.push([header, ...items].join("\n"));
    } else {
      const dayLabel = tomorrowDate.toLocaleDateString("en-US", { weekday: "long" });
      blocks.push(`Tomorrow's Classes — ${dayLabel}\n  No classes scheduled`);
    }
  }

  if (blocks.length === 0) {
    return [];
  }

  return [
    {
      userId,
      title: "Daily Summary",
      body: blocks.join("\n\n"),
      tag: "daily-summary",
      data: {
        url: "/today",
        type: "daily_summary",
      },
      requireInteraction: true,
    },
  ];
}

/**
 * Send push notifications to all active subscriptions.
 */
async function sendPushNotifications(
  notifications: NotificationPayload[]
): Promise<void> {
  const subscriptions = await getActiveSubscriptions();

  if (subscriptions.length === 0) return;

  // Configure web-push with VAPID keys
  const webPush = await import("web-push");
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn("VAPID keys not configured — skipping push delivery");
    return;
  }

  const vapidEmail = process.env.VAPID_EMAIL || "mailto:admin@example.com";
  webPush.default.setVapidDetails(
    vapidEmail,
    vapidPublicKey,
    vapidPrivateKey
  );

  // Deduplicate subscriptions per user — only send to the most recent subscription per user.
  // This prevents duplicate notifications when a user has multiple subscriptions
  // (e.g., from multiple browser tabs or devices).
  const latestSubByUser = new Map<string, typeof subscriptions[0]>();
  for (const sub of subscriptions) {
    const existing = latestSubByUser.get(sub.userId);
    if (!existing || sub.createdAt > existing.createdAt) {
      latestSubByUser.set(sub.userId, sub);
    }
  }

  for (const [, sub] of latestSubByUser) {
    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth,
      },
    };

    const userNotifications = notifications.filter((n) => n.userId === sub.userId);

    for (const notification of userNotifications) {
      try {
        await webPush.default.sendNotification(
          pushSubscription,
          JSON.stringify(notification)
        );
      } catch (error) {
        console.error("Failed to send push notification:", error);
        // If subscription is invalid, remove it
        if (
          error instanceof Error &&
          "statusCode" in error &&
          (error.statusCode === 404 || error.statusCode === 410)
        ) {
          await prisma.pushSubscription.deleteMany({
            where: { endpoint: sub.endpoint },
          });
        }
      }
    }
  }
}

// ─── Review Notifications ────────────────────────────────

/**
 * Generate a notification for unread daily reviews.
 * Fires in the morning (7-9 AM) if there's an unread daily review.
 */
async function generateDailyReviewAlert(
  userId: string,
  now: Date
): Promise<NotificationPayload[]> {
  // Trigger at 08:00
  if (!isWithinTimeWindow(now.getHours(), now.getMinutes(), "08:00")) return [];

  const review = await prisma.review.findFirst({
    where: { userId, type: "daily", status: "generated" },
    orderBy: { periodEnd: "desc" },
  });

  if (!review) return [];

  return [
    {
      userId,
      title: "Morning Brief Ready",
      body: "Your daily review is ready to read.",
      tag: "review-daily",
      data: { url: `/reviews/${review.id}`, type: "review_daily" },
    },
  ];
}

/**
 * Generate a notification for unread weekly reviews.
 * Fires every morning (8-9 AM) if there's an unread weekly review.
 * This ensures the user gets notified the morning after the cron generates it (Sunday 8 PM UTC).
 */
async function generateWeeklyReviewAlert(
  userId: string,
  now: Date
): Promise<NotificationPayload[]> {
  // Trigger at 08:00
  if (!isWithinTimeWindow(now.getHours(), now.getMinutes(), "08:00")) return [];

  const review = await prisma.review.findFirst({
    where: { userId, type: "weekly", status: "generated" },
    orderBy: { periodEnd: "desc" },
  });

  if (!review) return [];

  const actions = review.actions as { text?: string }[] | null;
  const actionCount = Array.isArray(actions) ? actions.filter((a) => a.text).length : 0;
  const body =
    actionCount > 0
      ? `Your weekly review has ${actionCount} action item${actionCount !== 1 ? "s" : ""} waiting.`
      : "Your weekly review is ready to read.";

  return [
    {
      userId,
      title: "Weekly Review Ready",
      body,
      tag: "review-weekly",
      data: { url: `/reviews/${review.id}`, type: "review_weekly" },
    },
  ];
}

/**
 * Generate a notification for unread monthly reviews.
 * Fires every morning (8-9 AM) if there's an unread monthly review.
 * This ensures the user gets notified the morning after the cron generates it (last day of month 8 PM UTC).
 */
async function generateMonthlyReviewAlert(
  userId: string,
  now: Date
): Promise<NotificationPayload[]> {
  // Trigger at 08:00
  if (!isWithinTimeWindow(now.getHours(), now.getMinutes(), "08:00")) return [];

  const review = await prisma.review.findFirst({
    where: { userId, type: "monthly", status: "generated" },
    orderBy: { periodEnd: "desc" },
  });

  if (!review) return [];

  const actions = review.actions as { text?: string }[] | null;
  const actionCount = Array.isArray(actions) ? actions.filter((a) => a.text).length : 0;
  const body =
    actionCount > 0
      ? `Your monthly review has ${actionCount} action item${actionCount !== 1 ? "s" : ""} waiting.`
      : "Your monthly strategic review is available.";

  return [
    {
      userId,
      title: "Monthly Review Ready",
      body,
      tag: "review-monthly",
      data: { url: `/reviews/${review.id}`, type: "review_monthly" },
    },
  ];
}

/**
 * Run the notification scheduler.
 * Call this periodically (e.g., via cron or app load).
 */
export async function runNotificationScheduler(force: boolean = false): Promise<void> {
  forceNotifications = force;
  try {
  // Find all distinct users that have push subscriptions
  const subscriptions = await prisma.pushSubscription.findMany({
    distinct: ["userId"],
    select: { userId: true },
  });

  const activeUserIds = subscriptions.map((sub) => sub.userId);
  if (activeUserIds.length === 0) return;

  const allNotifications: NotificationPayload[] = [];

  for (const userId of activeUserIds) {
    // Get user's timezone for time-aware scheduling
    let timezone: string | null = null;
    try {
      const pref = await prisma.notificationPreference.findFirst({
        where: { userId, timezone: { not: null } },
        select: { timezone: true },
      });
      timezone = pref?.timezone || null;
    } catch {
      // No timezone set — use server time
    }

    const userLocalTime = getUserLocalTime(timezone);

    // Fetch all preferences once for priority + quiet hours checks
    const prefs = await getPreferences(userId);

    // Helper: should this type be sent right now?
    async function shouldSend(type: NotificationType): Promise<boolean> {
      if (!isTypeEnabled(userId, type)) return false;

      const priority = getEffectivePriority(prefs, type);
      // Critical always sends
      if (priority === "critical") return true;

      // Normal/low respect quiet hours
      const pref = prefs.find((p) => p.type === type);
      const quietStart = pref?.quietHoursStart ?? "22:00";
      const quietEnd = pref?.quietHoursEnd ?? "07:00";
      if (isWithinQuietHours(userLocalTime.getHours(), userLocalTime.getMinutes(), quietStart, quietEnd)) {
        return false;
      }
      return true;
    }

    // Check each notification type
    if (await shouldSend("routine_reminder")) {
      allNotifications.push(...(await generateRoutineReminders(userId, userLocalTime)));
    }

    if (await shouldSend("task_due")) {
      allNotifications.push(...(await generateTaskNotifications(userId, userLocalTime)));
    }

    if (await shouldSend("class_start")) {
      allNotifications.push(...(await generateClassNotifications(userId, userLocalTime)));
    }

    if (await shouldSend("class_end")) {
      allNotifications.push(...(await generateClassEndNotifications(userId, userLocalTime)));
    }

    if (await shouldSend("class_cancelled")) {
      allNotifications.push(...(await generateClassCancellationNotifications(userId, userLocalTime)));
    }

    if (await shouldSend("class_rescheduled")) {
      allNotifications.push(...(await generateClassRescheduleNotifications(userId, userLocalTime)));
    }

    if (await shouldSend("assessment")) {
      allNotifications.push(...(await generateAssessmentNotifications(userId, userLocalTime)));
    }

    if (await shouldSend("daily_summary")) {
      allNotifications.push(...(await generateDailySummary(userId)));
    }

    if (await shouldSend("missed_routine")) {
      allNotifications.push(
        ...(await generateMissedRoutineNotifications(userId, userLocalTime))
      );
    }

    if (await shouldSend("overdue_task")) {
      allNotifications.push(
        ...(await generateOverdueTaskNotifications(userId, userLocalTime))
      );
    }

    if (await shouldSend("review_daily")) {
      allNotifications.push(
        ...(await generateDailyReviewAlert(userId, userLocalTime))
      );
    }

    if (await shouldSend("review_weekly")) {
      allNotifications.push(
        ...(await generateWeeklyReviewAlert(userId, userLocalTime))
      );
    }

    if (await shouldSend("review_monthly")) {
      allNotifications.push(
        ...(await generateMonthlyReviewAlert(userId, userLocalTime))
      );
    }
  }

  // ─── Digest Window ──────────────────────────────────────
  // Batch notifications for the same user within a 15-minute window.
  const digested = buildDigestWindows(allNotifications);

  // Send all notifications and track what was sent
  if (digested.length > 0) {
    await sendPushNotifications(digested);
    // Record what was sent for dedup (with type for analytics)
    for (const n of digested) {
      await markNotificationSent(n.userId, n.tag, n.data.type);
    }
  }

  // Cleanup old sent notifications (runs once per scheduler invocation)
  await cleanupOldSentNotifications();

  } finally {
    forceNotifications = false;
  }
}

// ─── Digest Window Batching ───────────────────────────────
// Groups notifications for the same user within a 15-minute window
// into a single push with a summary and "View all" deep link.

function buildDigestWindows(
  notifications: NotificationPayload[]
): NotificationPayload[] {
  if (notifications.length === 0) return [];

  // Group by userId
  const byUser = new Map<string, NotificationPayload[]>();
  for (const n of notifications) {
    const list = byUser.get(n.userId) || [];
    list.push(n);
    byUser.set(n.userId, list);
  }

  const result: NotificationPayload[] = [];

  for (const [userId, userNotifs] of byUser) {
    // Sort by tag order (approximate scheduled time)
    userNotifs.sort((a, b) => a.tag.localeCompare(b.tag));

    const windows: NotificationPayload[][] = [];
    let currentWindow: NotificationPayload[] = [userNotifs[0]];

    for (let i = 1; i < userNotifs.length; i++) {
      const prev = currentWindow[currentWindow.length - 1];
      const curr = userNotifs[i];
      // If current notification is a different type from the previous, start a new window
      // unless there are multiple types already in the window (batch mixed types too)
      if (curr.data.type !== prev.data.type) {
        windows.push(currentWindow);
        currentWindow = [curr];
      } else {
        currentWindow.push(curr);
      }
    }
    windows.push(currentWindow);

    for (const window of windows) {
      if (window.length === 1) {
        // Single notification — send as-is
        result.push(window[0]);
      } else {
        // Multiple notifications — build a digest
        const types = [...new Set(window.map((n) => n.data.type))];
        const summaryLines = window.map((n) => {
          const typeLabel = n.data.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
          return `${typeLabel}: ${n.body.split("\n")[0]}`;
        });
        const body = summaryLines.join(" · ");

        // Build individual URLs map
        const individualUrls: Record<string, string> = {};
        for (const n of window) {
          individualUrls[n.data.type] = n.data.url;
        }

        const tag = `digest-${userId}-${window[0].tag}`;
        const typesParam = types.join(",");

        result.push({
          userId,
          title: `${window.length} notifications`,
          body,
          tag,
          data: {
            url: `/notifications/digest?types=${typesParam}`,
            type: types[0],
            types,
            individualUrls,
          },
          actions: [{ action: "view", title: "View all" }],
          requireInteraction: true,
        });
      }
    }
  }

  return result;
}

/**
 * Get the day of week enum value from a JavaScript day number.
 */
function getDayOfWeekEnum(day: number): string {
  const map = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  return map[day];
}

/**
 * Format a date as a short readable string (e.g., "Jul 10").
 */
function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
