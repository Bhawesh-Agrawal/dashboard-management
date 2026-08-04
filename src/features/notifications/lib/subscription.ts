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

    await prisma.pushSubscription.upsert({
      where: {
        // Use endpoint as unique identifier
        id: subscription.endpoint.slice(-36), // Use last 36 chars as ID
      },
      create: {
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      update: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    });

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
