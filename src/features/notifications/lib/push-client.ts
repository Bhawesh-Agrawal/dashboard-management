/**
 * Client-side push notification helpers.
 * These use browser APIs (window, navigator) and cannot be in a "use server" file.
 */

import { subscribeToPush, unsubscribeFromPush } from "./subscription";

/**
 * Check if push notifications are supported in the current environment.
 */
export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

/**
 * Get the current push subscription status.
 */
export async function getPushStatus(): Promise<{
  supported: boolean;
  subscribed: boolean;
  permission: NotificationPermission;
}> {
  if (!isPushSupported()) {
    return { supported: false, subscribed: false, permission: "denied" };
  }

  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();

  return {
    supported: true,
    subscribed: !!subscription,
    permission: Notification.permission,
  };
}

/**
 * Request notification permission and subscribe to push.
 */
export async function requestPushSubscription(): Promise<{
  success: boolean;
  subscription?: PushSubscription;
}> {
  try {
    // Request permission
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { success: false };
    }

    // Get service worker registration
    const registration = await navigator.serviceWorker.ready;

    // Subscribe to push
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: getVapidPublicKey(),
    });

    // Store subscription in database via server action
    const result = await subscribeToPush({
      endpoint: subscription.endpoint,
      keys: {
        p256dh: btoa(
          String.fromCharCode(
            ...new Uint8Array(subscription.getKey("p256dh") as ArrayBuffer)
          )
        ),
        auth: btoa(
          String.fromCharCode(
            ...new Uint8Array(subscription.getKey("auth") as ArrayBuffer)
          )
        ),
      },
    });

    if (result.success) {
      return { success: true, subscription };
    }

    return { success: false };
  } catch (error) {
    console.error("Failed to subscribe to push:", error);
    return { success: false };
  }
}

/**
 * Unsubscribe from push notifications.
 */
export async function unsubscribePush(): Promise<{ success: boolean }> {
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();

    if (!subscription) {
      return { success: true };
    }

    await subscription.unsubscribe();
    await unsubscribeFromPush(subscription.endpoint);

    return { success: true };
  } catch (error) {
    console.error("Failed to unsubscribe from push:", error);
    return { success: false };
  }
}

/**
 * Get the VAPID public key from environment.
 */
function getVapidPublicKey(): string {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
}
