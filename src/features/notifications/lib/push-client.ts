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
  error?: string;
}> {
  try {
    // Request permission
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { success: false };
    }

    let registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
      if (process.env.NODE_ENV !== "production") {
        return { success: false, error: "Service Worker not available in development." };
      }
      console.log("No Service Worker found. Registering...");
      registration = await navigator.serviceWorker.register("/sw.js");
    }

    if (!registration) {
      return { success: false, error: "Failed to register Service Worker." };
    }
    
    // Ensure the service worker is fully active before subscribing
    registration = await navigator.serviceWorker.ready;

    // Subscribe to push
    const vapidKey = getVapidPublicKey();
    if (!vapidKey) {
      console.error("No VAPID key found in environment variables.");
      return { success: false, error: "VAPID configuration missing." };
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidKey as any,
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

    return { success: false, error: "Server failed to save subscription." };
  } catch (error) {
    console.error("Failed to subscribe to push:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
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
 * Get the VAPID public key from environment and convert to Uint8Array.
 */
function getVapidPublicKey(): Uint8Array | undefined {
  const base64String = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
  if (!base64String) return undefined;
  
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
