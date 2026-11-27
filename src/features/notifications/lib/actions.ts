"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/auth";
import { getNow } from "@/lib/clock";
import {
  DEFAULT_ENABLED_TYPES,
  DEFAULT_PRIORITY,
  type NotificationType,
} from "./scheduler";
import { searchCities, type CitySearchResult } from "@/features/briefs/lib/weather";

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
      "class_start",
      "class_end",
      "task_due",
      "calendar_event",
      "morning_brief",
      "evening_brief",
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
    const weekAgo = getNow();
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

export async function searchWeatherCitiesAction(
  query: string
): Promise<CitySearchResult[]> {
  await getCurrentUserId();
  return searchCities(query);
}

export async function saveWeatherLocationAction(input: {
  name: string;
  latitude: number;
  longitude: number;
}): Promise<{ success: boolean }> {
  try {
    const userId = await getCurrentUserId();
    await prisma.notificationPreference.upsert({
      where: {
        userId_type: { userId, type: "daily_summary" },
      },
      create: {
        userId,
        type: "daily_summary",
        enabled: true,
        locationName: input.name,
        locationLat: input.latitude,
        locationLon: input.longitude,
      },
      update: {
        locationName: input.name,
        locationLat: input.latitude,
        locationLon: input.longitude,
      },
    });
    revalidatePath("/settings");
    revalidatePath("/brief");
    return { success: true };
  } catch (error) {
    console.error("Failed to save weather location:", error);
    return { success: false };
  }
}

export async function getWeatherLocationAction(): Promise<{
  name: string | null;
  latitude: number | null;
  longitude: number | null;
}> {
  try {
    const userId = await getCurrentUserId();
    const pref = await prisma.notificationPreference.findFirst({
      where: { userId, locationLat: { not: null }, locationLon: { not: null } },
      select: { locationName: true, locationLat: true, locationLon: true },
    });
    return {
      name: pref?.locationName ?? null,
      latitude: pref?.locationLat ?? null,
      longitude: pref?.locationLon ?? null,
    };
  } catch {
    return { name: null, latitude: null, longitude: null };
  }
}

import {
  getDefaultBriefUserConfig,
  parseBriefUserConfig,
} from "@/features/briefs/lib/settings";
import type { BriefCardId } from "@/features/briefs/lib/payload-v2";

export interface BriefScheduleSettingsData {
  morningEnabled: boolean;
  morningTime: string;
  middayEnabled: boolean;
  middayTime: string;
  eveningEnabled: boolean;
  eveningTime: string;
  classReminderMinutes: number;
  eventReminderMinutes: number;
  quietHoursStart: string;
  quietHoursEnd: string;
  aiHeadline: boolean;
  includeAqi: boolean;
  cardOrder: BriefCardId[];
  enabledCards: BriefCardId[];
}

export async function getBriefScheduleSettingsAction(): Promise<BriefScheduleSettingsData> {
  const briefDefaults = getDefaultBriefUserConfig();
  const defaults: BriefScheduleSettingsData = {
    morningEnabled: true,
    morningTime: "07:00",
    middayEnabled: briefDefaults.middayEnabled,
    middayTime: briefDefaults.middayTime,
    eveningEnabled: true,
    eveningTime: "20:30",
    classReminderMinutes: 10,
    eventReminderMinutes: 15,
    quietHoursStart: "22:00",
    quietHoursEnd: "06:30",
    aiHeadline: briefDefaults.aiHeadline,
    includeAqi: briefDefaults.includeAqi,
    cardOrder: briefDefaults.cardOrder,
    enabledCards: briefDefaults.enabledCards,
  };

  try {
    const userId = await getCurrentUserId();
    const prefs = await prisma.notificationPreference.findMany({ where: { userId } });

    const morning = prefs.find((p) => p.type === "morning_brief");
    const midday = prefs.find((p) => p.type === "midday_brief");
    const evening = prefs.find((p) => p.type === "evening_brief");
    const classPref = prefs.find((p) => p.type === "class_start");
    const eventPref = prefs.find((p) => p.type === "calendar_event");
    const quietPref = prefs.find((p) => p.quietHoursStart && p.quietHoursEnd);
    const parsedBrief = parseBriefUserConfig(morning?.briefConfig, midday ?? null);

    return {
      morningEnabled: morning ? morning.enabled : defaults.morningEnabled,
      morningTime: morning?.dailySummaryTime ?? defaults.morningTime,
      middayEnabled: parsedBrief.middayEnabled,
      middayTime: parsedBrief.middayTime,
      eveningEnabled: evening ? evening.enabled : defaults.eveningEnabled,
      eveningTime: evening?.dailySummaryTime ?? defaults.eveningTime,
      classReminderMinutes: classPref?.reminderMinutes ?? defaults.classReminderMinutes,
      eventReminderMinutes: eventPref?.reminderMinutes ?? defaults.eventReminderMinutes,
      quietHoursStart: quietPref?.quietHoursStart ?? defaults.quietHoursStart,
      quietHoursEnd: quietPref?.quietHoursEnd ?? defaults.quietHoursEnd,
      aiHeadline: parsedBrief.aiHeadline,
      includeAqi: parsedBrief.includeAqi,
      cardOrder: parsedBrief.cardOrder,
      enabledCards: parsedBrief.enabledCards,
    };
  } catch {
    return defaults;
  }
}

export async function saveBriefScheduleSettingsAction(
  input: BriefScheduleSettingsData
): Promise<{ success: boolean }> {
  try {
    const userId = await getCurrentUserId();
    const briefConfigJson = {
      aiHeadline: input.aiHeadline,
      includeAqi: input.includeAqi,
      cardOrder: input.cardOrder,
      enabledCards: input.enabledCards,
    };

    await Promise.all([
      prisma.notificationPreference.upsert({
        where: { userId_type: { userId, type: "morning_brief" } },
        create: {
          userId,
          type: "morning_brief",
          enabled: input.morningEnabled,
          dailySummaryTime: input.morningTime,
          quietHoursStart: input.quietHoursStart,
          quietHoursEnd: input.quietHoursEnd,
          briefConfig: briefConfigJson,
        },
        update: {
          enabled: input.morningEnabled,
          dailySummaryTime: input.morningTime,
          quietHoursStart: input.quietHoursStart,
          quietHoursEnd: input.quietHoursEnd,
          briefConfig: briefConfigJson,
        },
      }),
      prisma.notificationPreference.upsert({
        where: { userId_type: { userId, type: "midday_brief" } },
        create: {
          userId,
          type: "midday_brief",
          enabled: input.middayEnabled,
          dailySummaryTime: input.middayTime,
          quietHoursStart: input.quietHoursStart,
          quietHoursEnd: input.quietHoursEnd,
        },
        update: {
          enabled: input.middayEnabled,
          dailySummaryTime: input.middayTime,
          quietHoursStart: input.quietHoursStart,
          quietHoursEnd: input.quietHoursEnd,
        },
      }),
      prisma.notificationPreference.upsert({
        where: { userId_type: { userId, type: "evening_brief" } },
        create: {
          userId,
          type: "evening_brief",
          enabled: input.eveningEnabled,
          dailySummaryTime: input.eveningTime,
          quietHoursStart: input.quietHoursStart,
          quietHoursEnd: input.quietHoursEnd,
        },
        update: {
          enabled: input.eveningEnabled,
          dailySummaryTime: input.eveningTime,
          quietHoursStart: input.quietHoursStart,
          quietHoursEnd: input.quietHoursEnd,
        },
      }),
      prisma.notificationPreference.upsert({
        where: { userId_type: { userId, type: "class_start" } },
        create: {
          userId,
          type: "class_start",
          enabled: true,
          priority: "critical",
          reminderMinutes: input.classReminderMinutes,
        },
        update: {
          reminderMinutes: input.classReminderMinutes,
        },
      }),
      prisma.notificationPreference.upsert({
        where: { userId_type: { userId, type: "calendar_event" } },
        create: {
          userId,
          type: "calendar_event",
          enabled: true,
          reminderMinutes: input.eventReminderMinutes,
          quietHoursStart: input.quietHoursStart,
          quietHoursEnd: input.quietHoursEnd,
        },
        update: {
          reminderMinutes: input.eventReminderMinutes,
          quietHoursStart: input.quietHoursStart,
          quietHoursEnd: input.quietHoursEnd,
        },
      }),
    ]);

    revalidatePath("/settings");
    revalidatePath("/brief");
    revalidatePath("/today");
    return { success: true };
  } catch (error) {
    console.error("Failed to save brief schedule settings:", error);
    return { success: false };
  }
}
