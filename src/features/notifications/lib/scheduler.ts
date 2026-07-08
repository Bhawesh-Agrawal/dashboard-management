import { prisma } from "@/lib/prisma";
import { getActiveSubscriptions } from "./subscription";
import {
  computeAttendancePercent,
} from "@/features/assessments/lib/calculations";
import { createClient } from "@/features/auth/lib/supabase-server";

/**
 * Notification types that can be scheduled.
 */
export type NotificationType =
  | "routine_reminder"
  | "task_due"
  | "class_start"
  | "assessment"
  | "daily_summary";

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

/**
 * Generate routine reminder notifications for the current time window.
 */
async function generateRoutineReminders(): Promise<NotificationPayload[]> {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinutes = now.getMinutes();
  const dayOfWeek = getDayOfWeekEnum(now.getDay()) as "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

  const notifications: NotificationPayload[] = [];

  // Find routines that should trigger at the current time
  const routines = await prisma.routine.findMany({
    where: {
      activeDays: { has: dayOfWeek },
      specificTime: { not: null },
    },
  });

  for (const routine of routines) {
    if (!routine.specificTime) continue;

    const [hours, minutes] = routine.specificTime.split(":").map(Number);
    const routineHour = hours;
    const routineMinutes = minutes;

    // Trigger if within 5 minutes of the scheduled time
    const diffMinutes =
      (routineHour * 60 + routineMinutes) - (currentHour * 60 + currentMinutes);

    if (diffMinutes >= 0 && diffMinutes < 5) {
      notifications.push({
        title: "🔄 Routine Reminder",
        body: `Time for: ${routine.name}`,
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
 */
async function generateTaskNotifications(): Promise<NotificationPayload[]> {
  const now = new Date();

  // Only trigger task summaries at 9:00 AM (between 09:00 and 09:04)
  if (now.getHours() !== 9 || now.getMinutes() >= 5) {
    return [];
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const notifications: NotificationPayload[] = [];

  // Find tasks due today or tomorrow
  const tasks = await prisma.task.findMany({
    where: {
      status: "open",
      dueDate: {
        gte: now,
        lte: tomorrow,
      },
    },
    include: { course: { select: { name: true } } },
  });

  for (const task of tasks) {
    const dueDate = new Date(task.dueDate!);
    const isToday = dueDate.toDateString() === now.toDateString();

    notifications.push({
      title: isToday ? "⚠️ Task Due Today" : "📅 Task Due Tomorrow",
      body: `${task.title}${task.course ? ` (${task.course.name})` : ""}`,
      tag: `task-${task.id}`,
      data: {
        url: "/tasks",
        type: "task_due",
      },
      actions: [{ action: "done", title: "Mark Done" }, { action: "view", title: "View" }],
      requireInteraction: true,
    });
  }

  return notifications;
}

/**
 * Generate class start notifications.
 */
async function generateClassNotifications(): Promise<NotificationPayload[]> {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinutes = now.getMinutes();
  const dayOfWeek = getDayOfWeekEnum(now.getDay());

  const notifications: NotificationPayload[] = [];

  // Find classes that should start in the next 10 minutes
  const schedules = await prisma.classSchedule.findMany({
    where: {
      dayOfWeek: dayOfWeek as "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN",
    },
    include: { course: { select: { name: true, color: true } } },
  });

  for (const schedule of schedules) {
    const [hours, minutes] = schedule.startTime.split(":").map(Number);
    const classHour = hours;
    const classMinutes = minutes;

    const diffMinutes =
      (classHour * 60 + classMinutes) - (currentHour * 60 + currentMinutes);

    // Trigger exactly once, 5-9 minutes before class starts
    if (diffMinutes >= 5 && diffMinutes < 10) {
      notifications.push({
        title: "📚 Class Starting Soon",
        body: `${schedule.course.name} at ${schedule.startTime}${schedule.location ? ` in ${schedule.location}` : ""}`,
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
 */
async function generateAssessmentNotifications(): Promise<
  NotificationPayload[]
> {
  const now = new Date();

  // Only trigger assessment summaries at 9:00 AM (09:00 to 09:04)
  if (now.getHours() !== 9 || now.getMinutes() >= 5) {
    return [];
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

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
      title: isToday ? "📝 Assessment Today" : "📝 Assessment Tomorrow",
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

type DailySummarySection = "classes" | "tasks" | "routines" | "deadlines" | "attendance";

/**
 * Generate the daily summary digest.
 * Respects user's dailySummaryTime and dailySummarySections preferences.
 */
async function generateDailySummary(userId: string): Promise<NotificationPayload[]> {
  const now = new Date();
  const dayOfWeek = getDayOfWeekEnum(now.getDay());

  // Fetch user's daily summary preferences
  let preferredTime = "19:00";
  let sections: DailySummarySection[] = ["classes", "tasks", "routines", "deadlines", "attendance"];

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
    }
  } catch {
    // Table may not exist yet — use defaults
  }

  // Check if current time is within 5 minutes of preferred time
  const [prefHours, prefMinutes] = preferredTime.split(":").map(Number);
  const currentHour = now.getHours();
  const currentMinutes = now.getMinutes();
  const diffMinutes =
    (prefHours * 60 + prefMinutes) - (currentHour * 60 + currentMinutes);

  // Strictly < 5 to prevent duplicate sends on the next 5-minute cron mark
  if (diffMinutes < 0 || diffMinutes >= 5) {
    // Not within the time window — skip daily summary
    return [];
  }

  // Build summary body based on selected sections
  const parts: string[] = [];

  if (sections.includes("classes")) {
    const classes = await prisma.classSchedule.findMany({
      where: {
        dayOfWeek: dayOfWeek as "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN",
      },
      include: { course: { select: { name: true } } },
    });
    if (classes.length > 0) {
      parts.push(`${classes.length} classes today`);
    }
  }

  if (sections.includes("tasks")) {
    const starredTasks = await prisma.task.findMany({
      where: { starred: true, status: "open" },
      take: 3,
    });
    if (starredTasks.length > 0) {
      parts.push(`${starredTasks.length} top tasks`);
    }
  }

  if (sections.includes("attendance")) {
    const activeSemester = await prisma.semester.findFirst({
      where: { isActive: true },
    });

    const attendanceAlerts: string[] = [];
    if (activeSemester) {
      const courses = await prisma.course.findMany({
        where: { semesterId: activeSemester.id },
        include: { attendanceRecords: true },
      });

      for (const course of courses) {
        const present = course.attendanceRecords.filter(
          (r) => r.status === "present"
        ).length;
        const absent = course.attendanceRecords.filter(
          (r) => r.status === "absent"
        ).length;
        const percent = computeAttendancePercent(present, absent);

        if (percent < 75 && present + absent > 0) {
          attendanceAlerts.push(course.name);
        }
      }
    }

    if (attendanceAlerts.length > 0) {
      parts.push(`${attendanceAlerts.length} attendance alert${attendanceAlerts.length > 1 ? "s" : ""}`);
    }
  }

  if (sections.includes("routines")) {
    const routines = await prisma.routine.findMany({
      where: {
        activeDays: { has: dayOfWeek as "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN" },
      },
    });
    if (routines.length > 0) {
      parts.push(`${routines.length} routines`);
    }
  }

  if (sections.includes("deadlines")) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 7);
    const upcomingTasks = await prisma.task.findMany({
      where: {
        status: "open",
        dueDate: { gte: now, lte: tomorrow },
      },
    });
    if (upcomingTasks.length > 0) {
      parts.push(`${upcomingTasks.length} deadlines this week`);
    }
  }

  if (parts.length === 0) {
    return [];
  }

  return [
    {
      title: "📊 Daily Summary",
      body: parts.join(", "),
      tag: "daily-summary",
      data: {
        url: "/today",
        type: "daily_summary",
      },
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

/**
 * Run the notification scheduler.
 * Call this periodically (e.g., via cron or app load).
 */
export async function runNotificationScheduler(): Promise<void> {
  // Get the actual user ID from Supabase auth
  let userId = "default-user";
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) userId = user.id;
  } catch {
    // Fall back to default-user if auth fails
  }

  const notifications: NotificationPayload[] = [];

  // Check each notification type
  if (await isTypeEnabled(userId, "routine_reminder")) {
    notifications.push(...(await generateRoutineReminders()));
  }

  if (await isTypeEnabled(userId, "task_due")) {
    notifications.push(...(await generateTaskNotifications()));
  }

  if (await isTypeEnabled(userId, "class_start")) {
    notifications.push(...(await generateClassNotifications()));
  }

  if (await isTypeEnabled(userId, "assessment")) {
    notifications.push(...(await generateAssessmentNotifications()));
  }

  if (await isTypeEnabled(userId, "daily_summary")) {
    notifications.push(...(await generateDailySummary(userId)));
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
