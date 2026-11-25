"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";

/**
 * Subscribe to Web Push notifications.
 * Stores the subscription endpoint and keys in the database.
 */
export async function subscribeToPush(subscription: {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}): Promise<{ success: boolean }> {
  try {
    const userId = await getCurrentUserId();

    const existing = await prisma.pushSubscription.findFirst({
      where: {
        userId,
        endpoint: subscription.endpoint,
      },
    });

    if (existing) {
      await prisma.pushSubscription.update({
        where: { id: existing.id },
        data: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
      });
    } else {
      await prisma.pushSubscription.create({
        data: {
          userId,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
      });
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to subscribe to push:", error);
    return { success: false };
  }
}

/**
 * Unsubscribe from Web Push notifications.
 */
export async function unsubscribeFromPush(
  endpoint: string
): Promise<{ success: boolean }> {
  try {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint },
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to unsubscribe from push:", error);
    return { success: false };
  }
}

/**
 * Get all active push subscriptions.
 * Used by the notification scheduler to send push notifications.
 */
export async function getActiveSubscriptions() {
  return prisma.pushSubscription.findMany({
    orderBy: { createdAt: "desc" },
  });
}
