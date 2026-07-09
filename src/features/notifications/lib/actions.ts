"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { createClient } from "@/features/auth/lib/supabase-server";

type DailySummarySection =
  | "classes"
  | "tasks"
  | "routines"
  | "deadlines"
  | "attendance"
  | "tomorrow_classes";

/**
 * Get the current user's ID from Supabase auth.
 * Falls back to "default-user" if auth fails.
 */
async function getCurrentUserId(): Promise<string> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id || "default-user";
  } catch {
    return "default-user";
  }
}

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

    revalidatePath("/settings");
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
