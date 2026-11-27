"use server";

import {
  getAuthUrl,
  isGoogleCalendarConnected,
  disconnectGoogleCalendar,
  disconnectGoogleAccount,
  listConnectedAccounts,
  refreshAccountCalendars,
  toggleCalendarSubscription,
  type ConnectedGoogleAccountInfo,
} from "@/features/calendar/lib/google-calendar";
import { getCalendarEvents } from "@/features/calendar/lib/queries";
import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/auth";

/**
 * Get the Google Calendar authorization URL.
 */
export async function getGoogleCalendarAuthUrl(): Promise<{ url: string }> {
  const url = await getAuthUrl();
  return { url };
}

/**
 * Check if any Google Calendar account is connected.
 */
export async function checkGoogleCalendarConnection(): Promise<{
  connected: boolean;
}> {
  const userId = await getCurrentUserId();
  const connected = await isGoogleCalendarConnected(userId);
  return { connected };
}

/**
 * List all connected Google accounts and their calendars.
 */
export async function getGoogleCalendarAccountsAction(): Promise<{
  accounts: ConnectedGoogleAccountInfo[];
}> {
  const userId = await getCurrentUserId();
  const accounts = await listConnectedAccounts(userId);
  return { accounts };
}

/**
 * Toggle whether a specific Google calendar subscription is synced.
 */
export async function toggleGoogleCalendarSubscriptionAction(
  subscriptionId: string,
  enabled: boolean
): Promise<{ success: boolean }> {
  try {
    const userId = await getCurrentUserId();
    await toggleCalendarSubscription(subscriptionId, enabled, userId);
    revalidatePath("/settings");
    revalidatePath("/calendar");
    revalidatePath("/today");
    return { success: true };
  } catch (error) {
    console.error("Failed to toggle Google Calendar subscription:", error);
    return { success: false };
  }
}

/**
 * Refresh the calendar list for a connected Google account.
 */
export async function refreshGoogleAccountCalendarsAction(
  accountId: string
): Promise<{ success: boolean }> {
  try {
    const userId = await getCurrentUserId();
    await refreshAccountCalendars(accountId, userId);
    revalidatePath("/settings");
    revalidatePath("/calendar");
    return { success: true };
  } catch (error) {
    console.error("Failed to refresh Google account calendars:", error);
    return { success: false };
  }
}

/**
 * Disconnect a single Google account.
 */
export async function disconnectGoogleAccountAction(
  accountId: string
): Promise<{ success: boolean }> {
  try {
    const userId = await getCurrentUserId();
    await disconnectGoogleAccount(accountId, userId);
    revalidatePath("/settings");
    revalidatePath("/calendar");
    revalidatePath("/today");
    return { success: true };
  } catch (error) {
    console.error("Failed to disconnect Google account:", error);
    return { success: false };
  }
}

/**
 * Disconnect all Google Calendar accounts.
 */
export async function disconnectGoogleCalendarAction(): Promise<{
  success: boolean;
}> {
  try {
    const userId = await getCurrentUserId();
    await disconnectGoogleCalendar(userId);
    revalidatePath("/settings");
    revalidatePath("/calendar");
    revalidatePath("/today");
    return { success: true };
  } catch (error) {
    console.error("Failed to disconnect Google Calendar:", error);
    return { success: false };
  }
}

/**
 * Fetch calendar events for a date range.
 * Returns JSON-serializable data — safe to pass from server action to client.
 */
export async function getCalendarEventsAction(
  startDate: string,
  endDate: string
): Promise<{
  events: {
    id: string;
    title: string;
    date: string;
    time?: string;
    endTime?: string;
    type: "class" | "assessment" | "task" | "event" | "birthday";
    courseId?: string;
    courseName?: string;
    courseColor?: string;
    location?: string;
    isBirthday?: boolean;
  }[];
  currentDate: string;
}> {
  const events = await getCalendarEvents(new Date(startDate), new Date(endDate));
  return { events, currentDate: new Date().toISOString() };
}
