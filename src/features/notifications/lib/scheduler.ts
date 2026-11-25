import { prisma } from "@/lib/prisma";
import { getNow } from "@/lib/clock";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";
import {
  buildDedupKey,
  dispatchNotifications,
  type NotificationCandidate,
} from "./engine";
import {
  computeAttendancePercent,
} from "@/features/assessments/lib/calculations";
import { currentSemesterWhere } from "@/features/semesters/lib/current";

function localDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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

// Dedup, preference, and quiet-hours checks are centralized in engine.ts (dispatchNotifications).

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
  const tz = timezone || DEFAULT_TIMEZONE;

  try {
    const now = getNow();
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
    return getNow();
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

  const now = getNow();
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
        semester: currentSemesterWhere(userId, localDateOnly(userLocalTime)),
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
      const todayStr = localDateOnly(userLocalTime);
      const fullTag = buildDedupKey("class_start", schedule.id, todayStr);

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
        semester: currentSemesterWhere(userId, localDateOnly(userLocalTime)),
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
      const todayDateStr = localDateOnly(userLocalTime);
      const tag = buildDedupKey("class_end", schedule.id, todayDateStr);

      // Skip if attendance already recorded for this schedule+date
      const existing = await prisma.attendanceRecord.findFirst({
        where: {
          courseId: schedule.courseId,
          date: today,
          OR: [
            { classScheduleId: schedule.id },
            { classScheduleId: null },
          ],
        },
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
          classScheduleId: schedule.id,
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
          semester: currentSemesterWhere(userId, localDateOnly(userLocalTime)),
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
          semester: currentSemesterWhere(userId, localDateOnly(userLocalTime)),
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

  const now = getNow();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(23, 59, 59, 999);

  const notifications: NotificationPayload[] = [];

  const assessments = await prisma.assessment.findMany({
    where: {
      course: { semester: currentSemesterWhere(userId, localDateOnly(userLocalTime)) },
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
  const thirtyDaysAgo = getNow();
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

  const now = getNow();

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

  const now = getNow();
  const dayOfWeek = getDayOfWeekEnum(userLocalTime.getDay());

  // Build detailed summary body section by section
  const blocks: string[] = [];

  // ─── Today's Classes ─────────────────────────────────────
  if (sections.includes("classes")) {
    const classes = await prisma.classSchedule.findMany({
      where: {
        course: { semester: currentSemesterWhere(userId, localDateOnly(userLocalTime)) },
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
      const thirtyDaysAgo = getNow();
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
      where: currentSemesterWhere(userId, localDateOnly(userLocalTime)),
      orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
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
        course: { semester: currentSemesterWhere(userId, localDateOnly(userLocalTime)) },
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

// Push delivery is handled exclusively by dispatchNotifications in ./engine.ts.

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
      body: "Your morning brief is ready to read.",
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
    const subscriptions = await prisma.pushSubscription.findMany({
      distinct: ["userId"],
      select: { userId: true },
    });

    const activeUserIds = subscriptions.map((sub) => sub.userId);
    if (activeUserIds.length === 0) return;

    const now = getNow();
    const candidates: NotificationCandidate[] = [];

    for (const userId of activeUserIds) {
      let timezone: string | null = null;
      try {
        const pref = await prisma.notificationPreference.findFirst({
          where: { userId, timezone: { not: null } },
          select: { timezone: true },
        });
        timezone = pref?.timezone || null;
      } catch {
        // Fallback to DEFAULT_TIMEZONE
      }

      const userLocalTime = getUserLocalTime(timezone);
      const occurrenceDate = localDateOnly(userLocalTime);

      const generated: NotificationPayload[] = [
        ...(await generateRoutineReminders(userId, userLocalTime)),
        ...(await generateTaskNotifications(userId, userLocalTime)),
        ...(await generateClassNotifications(userId, userLocalTime)),
        ...(await generateClassEndNotifications(userId, userLocalTime)),
        ...(await generateClassCancellationNotifications(userId, userLocalTime)),
        ...(await generateClassRescheduleNotifications(userId, userLocalTime)),
        ...(await generateAssessmentNotifications(userId, userLocalTime)),
        ...(await generateDailySummary(userId)),
        ...(await generateMissedRoutineNotifications(userId, userLocalTime)),
        ...(await generateOverdueTaskNotifications(userId, userLocalTime)),
        ...(await generateDailyReviewAlert(userId, userLocalTime)),
        ...(await generateWeeklyReviewAlert(userId, userLocalTime)),
        ...(await generateMonthlyReviewAlert(userId, userLocalTime)),
      ];

      for (const payload of generated) {
        const type = payload.data.type;
        const dedupKey = payload.tag.startsWith(`${type}:`)
          ? payload.tag
          : buildDedupKey(type, payload.tag, occurrenceDate);
        const extraData: Record<string, string | number | boolean | undefined> = {};
        for (const [k, v] of Object.entries(payload.data)) {
          if (k === "url" || k === "type") continue;
          if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v === undefined) {
            extraData[k] = v;
          }
        }
        candidates.push({
          userId: payload.userId,
          type,
          entityId: payload.tag,
          occurrenceDate,
          scheduledFor: now,
          dedupKey,
          title: payload.title,
          body: payload.body,
          url: payload.data.url,
          actions: payload.actions,
          data: extraData,
          requireInteraction: payload.requireInteraction,
        });
      }
    }

    await dispatchNotifications(candidates, { now });
    await cleanupOldSentNotifications();
  } finally {
    forceNotifications = false;
  }
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
