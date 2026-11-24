import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";

/**
 * Returns the configured timezone for a user, falling back to "Asia/Kolkata".
 */
export async function getUserTimezone(userId?: string): Promise<string> {
  try {
    const targetUserId = userId || (await getCurrentUserId());
    if (!targetUserId) return DEFAULT_TIMEZONE;

    const pref = await prisma.notificationPreference.findUnique({
      where: {
        userId_type: {
          userId: targetUserId,
          type: "daily_summary",
        },
      },
      select: { timezone: true },
    });

    return pref?.timezone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/**
 * Sets the configured timezone for a user in their daily summary preferences.
 */
export async function setUserTimezone(timezone: string, userId?: string): Promise<void> {
  const targetUserId = userId || (await getCurrentUserId());
  if (!targetUserId) return;

  await prisma.notificationPreference.upsert({
    where: {
      userId_type: {
        userId: targetUserId,
        type: "daily_summary",
      },
    },
    update: { timezone },
    create: {
      userId: targetUserId,
      type: "daily_summary",
      timezone,
    },
  });
}
