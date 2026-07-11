import { prisma } from "@/lib/prisma";
import { getActiveSubscriptions } from "./subscription";
import {
  computeAttendancePercent,
} from "@/features/assessments/lib/calculations";
import { getCurrentUserId } from "@/lib/auth";

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
  | "review_monthly";

/**
 * Notification data structure for push messages.
 */
export type NotificationPayload = {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag: string;
  data: {
    url: string;
    type: NotificationType;
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
 */
async function isTypeEnabled(
  userId: string,
  type: NotificationType
): Promise<boolean> {
  const prefs = await getPreferences(userId);
  const pref = prefs.find((p) => p.type === type);
  return pref?.enabled ?? true; // Default to enabled
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
 * Falls back to server time if no timezone is configured.
 */
function getUserLocalTime(timezone: string | null | undefined): Date {
  if (!timezone) return new Date();

  try {
    const now = new Date();
    // Format current UTC time in the user's timezone
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
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
function isWithinTimeWindow(
  currentHour: number,
  currentMinutes: number,
  targetTime: string,
  windowMinutes: number = 5
): boolean {
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
  userLocalTime: Date
): Promise<NotificationPayload[]> {
  // Only trigger at 09:00
  if (!isWithinTimeWindow(userLocalTime.getHours(), userLocalTime.getMinutes(), "09:00")) {
    return [];
  }

  const userId = await getCurrentUserId();
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

  for (const task of tasks) {
    const dueDate = new Date(task.dueDate!);
    const isToday = dueDate.toDateString() === now.toDateString();
    const coursePart = task.course ? ` | ${task.course.name}` : "";

    notifications.push({
      title: isToday ? "Task Due Today" : "Task Due Tomorrow",
      body: `${task.title}${coursePart} | Priority P${task.priority}`,
      tag: `task-${task.id}`,
      data: {
        url: "/tasks",
        type: "task_due",
      },
      actions: [
        { action: "done", title: "Mark Done" },
        { action: "view", title: "View" },
      ],
      requireInteraction: true,
    });
  }

  return notifications;
}

/**
 * Generate class start notifications.
 */
async function generateClassNotifications(
  userLocalTime: Date
): Promise<NotificationPayload[]> {
  const currentHour = userLocalTime.getHours();
  const currentMinutes = userLocalTime.getMinutes();
  const dayOfWeek = getDayOfWeekEnum(userLocalTime.getDay());

  const notifications: NotificationPayload[] = [];

  // Find classes scheduled today
  const schedules = await prisma.classSchedule.findMany({
    where: {
      dayOfWeek: dayOfWeek as "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN",
    },
    include: { course: { select: { name: true, color: true } } },
  });

  for (const schedule of schedules) {
    const [hours, minutes] = schedule.startTime.split(":").map(Number);
    const diffMinutes =
      (hours * 60 + minutes) - (currentHour * 60 + currentMinutes);

    // Trigger exactly once, 5-9 minutes before class starts
    if (diffMinutes >= 5 && diffMinutes < 10) {
      const locationPart = schedule.location ? ` | ${schedule.location}` : "";

      notifications.push({
        title: "Class Starting Soon",
        body: `${schedule.course.name} at ${schedule.startTime}${locationPart}`,
        tag: `class-${schedule.id}`,
        data: {
          url: `/courses/${schedule.courseId}`,
          type: "class_start",
        },
        actions: [{ action: "view", title: "View Course" }],
        requireInteraction: true,
      });
    }
  }

  return notifications;
}

/**
 * Generate assessment reminder notifications.
 * Triggers at 09:00 in the user's local time.
 */
async function generateAssessmentNotifications(
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
      date: { gte: now, lte: tomorrow },
      obtainedMarks: null,
    },
    include: { course: { select: { name: true } } },
  });

  for (const assessment of assessments) {
    const dueDate = new Date(assessment.date!);
    const isToday = dueDate.toDateString() === now.toDateString();

    notifications.push({
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
  userLocalTime: Date
): Promise<NotificationPayload[]> {
  // Only trigger at 10:00
  if (!isWithinTimeWindow(userLocalTime.getHours(), userLocalTime.getMinutes(), "10:00")) {
    return [];
  }

  const userId = await getCurrentUserId();
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

  const lines: string[] = [];
  for (const task of overdueTasks) {
    const daysOverdue = Math.ceil(
      (now.getTime() - new Date(task.dueDate!).getTime()) / (1000 * 60 * 60 * 24)
    );
    const coursePart = task.course ? ` | ${task.course.name}` : "";
    const daysLabel = daysOverdue === 1 ? "1 day overdue" : `${daysOverdue} days overdue`;
    lines.push(`- ${task.title} (${daysLabel}${coursePart})`);
  }

  return [
    {
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
      where: { isActive: true },
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

  webPush.default.setVapidDetails(
    "mailto:academic-command-center@example.com",
    vapidPublicKey,
    vapidPrivateKey
  );

  for (const sub of subscriptions) {
    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth,
      },
    };

    for (const notification of notifications) {
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
  const hour = now.getHours();
  if (hour < 7 || hour > 9) return [];

  const review = await prisma.review.findFirst({
    where: { userId, type: "daily", status: "generated" },
    orderBy: { periodEnd: "desc" },
  });

  if (!review) return [];

  return [
    {
      title: "Morning Brief Ready",
      body: "Your daily review is ready to read.",
      tag: "review-daily",
      data: { url: `/reviews/${review.id}`, type: "review_daily" },
    },
  ];
}

/**
 * Generate a notification for unread weekly reviews.
 * Fires on Sunday evening (6-8 PM) if there's an unread weekly review.
 */
async function generateWeeklyReviewAlert(
  userId: string,
  now: Date
): Promise<NotificationPayload[]> {
  const day = now.getDay(); // 0 = Sunday
  const hour = now.getHours();
  if (day !== 0 || hour < 18 || hour > 20) return [];

  const review = await prisma.review.findFirst({
    where: { userId, type: "weekly", status: "generated" },
    orderBy: { periodEnd: "desc" },
  });

  if (!review) return [];

  return [
    {
      title: "Weekly Review Ready",
      body: "Your weekly review is ready to read.",
      tag: "review-weekly",
      data: { url: `/reviews/${review.id}`, type: "review_weekly" },
    },
  ];
}

/**
 * Generate a notification for unread monthly reviews.
 * Fires on the last day of the month (6-8 PM) if there's an unread monthly review.
 */
async function generateMonthlyReviewAlert(
  userId: string,
  now: Date
): Promise<NotificationPayload[]> {
  const hour = now.getHours();
  if (hour < 18 || hour > 20) return [];

  // Check if today is the last day of the month
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isLastDay = now.getMonth() !== tomorrow.getMonth();
  if (!isLastDay) return [];

  const review = await prisma.review.findFirst({
    where: { userId, type: "monthly", status: "generated" },
    orderBy: { periodEnd: "desc" },
  });

  if (!review) return [];

  return [
    {
      title: "Monthly Review Ready",
      body: "Your monthly strategic review is available.",
      tag: "review-monthly",
      data: { url: `/reviews/${review.id}`, type: "review_monthly" },
    },
  ];
}

/**
 * Run the notification scheduler.
 * Call this periodically (e.g., via cron or app load).
 */
export async function runNotificationScheduler(): Promise<void> {
  const userId = await getCurrentUserId();

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
  const notifications: NotificationPayload[] = [];

  // Check each notification type
  if (await isTypeEnabled(userId, "routine_reminder")) {
    notifications.push(...(await generateRoutineReminders(userLocalTime)));
  }

  if (await isTypeEnabled(userId, "task_due")) {
    notifications.push(...(await generateTaskNotifications(userLocalTime)));
  }

  if (await isTypeEnabled(userId, "class_start")) {
    notifications.push(...(await generateClassNotifications(userLocalTime)));
  }

  if (await isTypeEnabled(userId, "assessment")) {
    notifications.push(...(await generateAssessmentNotifications(userLocalTime)));
  }

  if (await isTypeEnabled(userId, "daily_summary")) {
    notifications.push(...(await generateDailySummary(userId)));
  }

  if (await isTypeEnabled(userId, "missed_routine")) {
    notifications.push(
      ...(await generateMissedRoutineNotifications(userLocalTime))
    );
  }

  if (await isTypeEnabled(userId, "overdue_task")) {
    notifications.push(
      ...(await generateOverdueTaskNotifications(userLocalTime))
    );
  }

  if (await isTypeEnabled(userId, "review_daily")) {
    notifications.push(
      ...(await generateDailyReviewAlert(userId, userLocalTime))
    );
  }

  if (await isTypeEnabled(userId, "review_weekly")) {
    notifications.push(
      ...(await generateWeeklyReviewAlert(userId, userLocalTime))
    );
  }

  if (await isTypeEnabled(userId, "review_monthly")) {
    notifications.push(
      ...(await generateMonthlyReviewAlert(userId, userLocalTime))
    );
  }

  // Send all notifications
  if (notifications.length > 0) {
    await sendPushNotifications(notifications);
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
