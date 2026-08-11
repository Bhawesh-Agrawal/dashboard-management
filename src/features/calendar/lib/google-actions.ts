"use server";

import {
  getAuthUrl,
  isGoogleCalendarConnected,
  disconnectGoogleCalendar,
  getCalendarList,
} from "@/features/calendar/lib/google-calendar";
import { getCalendarEvents } from "@/features/calendar/lib/queries";
import { revalidatePath } from "next/cache";
import { createClient } from "@/features/auth/lib/supabase-server";

/**
 * Get the current user's ID from Supabase auth.
 * Returns a fallback "default-user" for backward compatibility.
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
 * Get the Google Calendar authorization URL.
 */
export async function getGoogleCalendarAuthUrl(): Promise<{ url: string }> {
  const url = await getAuthUrl();
  return { url };
}

/**
 * Check if Google Calendar is connected.
 */
export async function checkGoogleCalendarConnection(): Promise<{
  connected: boolean;
}> {
  const userId = await getCurrentUserId();
  const connected = await isGoogleCalendarConnected(userId);
  return { connected };
}

/**
 * Disconnect Google Calendar.
 */
export async function disconnectGoogleCalendarAction(): Promise<{
  success: boolean;
}> {
  try {
    const userId = await getCurrentUserId();
    await disconnectGoogleCalendar(userId);
    revalidatePath("/settings");
    revalidatePath("/calendar");
    return { success: true };
  } catch (error) {
    console.error("Failed to disconnect Google Calendar:", error);
    return { success: false };
  }
}

/**
 * Get the list of calendars from the connected Google account.
 * Shows which calendars are being synced (primary + Birthdays).
 */
export async function getGoogleCalendarCalendars(): Promise<{
  calendars: { id: string; summary: string; primary: boolean }[];
}> {
  const userId = await getCurrentUserId();
  const calendars = await getCalendarList(userId);
  return { calendars };
}

/**
 * Fetch calendar events for a date range.
 * Returns JSON-serializable data — safe to pass from server action to client.
 * Now tags birthday events with isBirthday flag.
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