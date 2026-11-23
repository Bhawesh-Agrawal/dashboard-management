"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/auth";
import {
  DEFAULT_ENABLED_TYPES,
  DEFAULT_PRIORITY,
  type NotificationType,
} from "./scheduler";

type DailySummarySection =
  | "classes"
  | "tasks"
  | "routines"
  | "deadlines"
  | "attendance"
  | "tomorrow_classes";

/**
 * Save daily summary preferences including timezone.
 */
export async function saveDailySummaryPreferences(
  time: string,
  sections: DailySummarySection[],
  timezone: string
): Promise<{ success: boolean }> {
  try {
    const userId = await getCurrentUserId();

    await prisma.notificationPreference.upsert({
      where: {
        userId_type: {
          userId,
          type: "daily_summary",
        },
      },
      create: {
        userId,
        type: "daily_summary",
        enabled: true,
        dailySummaryTime: time,
        dailySummarySections: sections,
        timezone,
      },
      update: {
        dailySummaryTime: time,
        dailySummarySections: sections,
        timezone,
      },
    });

    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    console.error("Failed to save daily summary preferences:", error);
    return { success: false };
  }
}

/**
 * Get daily summary preferences including timezone.
 * Returns defaults if table doesn't exist.
 */
export async function getDailySummaryPreferences(): Promise<{
  time: string;
  sections: DailySummarySection[];
  timezone: string;
} | null> {
  try {
    const userId = await getCurrentUserId();

    const pref = await prisma.notificationPreference.findUnique({
      where: {
        userId_type: {
          userId,
          type: "daily_summary",
        },
      },
    });

    if (!pref) {
      return {
        time: "19:00", // Default: 7:00 PM
        sections: [
          "classes",
          "tasks",
          "routines",
          "deadlines",
          "attendance",
          "tomorrow_classes",
        ],
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
    }

    return {
      time: pref.dailySummaryTime || "19:00",
      sections: (pref.dailySummarySections as DailySummarySection[]) || [
        "classes",
        "tasks",
        "routines",
        "deadlines",
        "attendance",
        "tomorrow_classes",
      ],
      timezone: pref.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  } catch {
    // Table may not exist yet — return defaults
    return {
      time: "19:00",
      sections: [
        "classes",
        "tasks",
        "routines",
        "deadlines",
        "attendance",
        "tomorrow_classes",
      ],
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }
}

/**
 * Toggle a notification type on/off.
 */
export async function toggleNotificationType(
  type: string,
  enabled: boolean
): Promise<{ success: boolean }> {
  try {
    const userId = await getCurrentUserId();

    await prisma.notificationPreference.upsert({
      where: {
        userId_type: {
          userId,
          type,
        },
      },
      create: {
        userId,
        type,
        enabled,
      },
      update: {
        enabled,
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to toggle notification type:", error);
    return { success: false };
  }
}

/**
 * Get all notification preferences.
 */
export async function getNotificationPreferences() {
  const userId = await getCurrentUserId();

  return prisma.notificationPreference.findMany({
    where: { userId },
  });
}

// ─── Priority + Quiet Hours ───────────────────────────────

/**
 * Update the priority tier for a notification type.
 */
export async function updateNotificationPriority(
  type: string,
  priority: "critical" | "normal" | "low"
): Promise<{ success: boolean }> {
  try {
    const userId = await getCurrentUserId();

    await prisma.notificationPreference.upsert({
      where: {
        userId_type: { userId, type },
      },
      create: {
        userId,
        type,
        enabled: true,
        priority,
      },
      update: { priority },
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to update notification priority:", error);
    return { success: false };
  }
}

/**
 * Update quiet hours window for a specific notification type.
 */
export async function updateQuietHours(
  type: string,
  start: string,
  end: string
): Promise<{ success: boolean }> {
  try {
    const userId = await getCurrentUserId();

    await prisma.notificationPreference.upsert({
      where: {
        userId_type: { userId, type },
      },
      create: {
        userId,
        type,
        enabled: true,
        quietHoursStart: start,
        quietHoursEnd: end,
      },
      update: {
        quietHoursStart: start,
        quietHoursEnd: end,
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to update quiet hours:", error);
    return { success: false };
  }
}

// ─── Reset to Defaults ────────────────────────────────────

/**
 * Reset all notification preferences to the lean starter set.
 * Deletes existing rows and recreates with defaults.
 */
export async function resetToDefaultPreferences(): Promise<{ success: boolean }> {
  try {
    const userId = await getCurrentUserId();

    // Delete all existing preferences
    await prisma.notificationPreference.deleteMany({
      where: { userId },
    });

    // Create rows for the 4 default types (ON)
    for (const type of DEFAULT_ENABLED_TYPES) {
      await prisma.notificationPreference.create({
        data: {
          userId,
          type,
          enabled: true,
          priority: DEFAULT_PRIORITY[type],
        },
      });
    }

    // Create rows for all other types (OFF)
    const allTypes: NotificationType[] = [
      "routine_reminder",
      "task_due",
      "class_start",
      "class_end",
      "assessment",
      "daily_summary",
      "missed_routine",
      "overdue_task",
      "review_daily",
      "review_weekly",
      "review_monthly",
    ];
    for (const type of allTypes) {
      if (!DEFAULT_ENABLED_TYPES.includes(type)) {
        await prisma.notificationPreference.create({
          data: {
            userId,
            type,
            enabled: false,
            priority: DEFAULT_PRIORITY[type],
          },
        });
      }
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to reset notification preferences:", error);
    return { success: false };
  }
}

// ─── Weekly Notification Stats ────────────────────────────

export type NotificationTypeStats = {
  type: string;
  sent: number;
  opened: number;
  openRate: number;
};

/**
 * Get weekly notification stats: sent count, opened count, and open rate per type.
 */
export async function getNotificationWeeklyStats(): Promise<NotificationTypeStats[]> {
  try {
    const userId = await getCurrentUserId();
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const rows = await prisma.sentNotification.groupBy({
      by: ["type"],
      where: {
        userId,
        sentAt: { gte: weekAgo },
      },
      _count: { id: true },
    });

    const stats: NotificationTypeStats[] = [];

    for (const row of rows) {
      const sent = row._count.id;
      const opened = await prisma.sentNotification.count({
        where: {
          userId,
          type: row.type,
          sentAt: { gte: weekAgo },
          openedAt: { not: null },
        },
      });

      stats.push({
        type: row.type,
        sent,
        opened,
        openRate: sent > 0 ? Math.round((opened / sent) * 100) : 0,
      });
    }

    return stats;
  } catch {
    return [];
  }
}
