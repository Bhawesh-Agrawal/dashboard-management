import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, UnauthorizedError } from "@/lib/auth";
import {
  fetchGoogleCalendarEvents,
  isGoogleCalendarConnected,
} from "@/features/calendar/lib/google-calendar";

/**
 * API endpoint for Google Calendar background sync.
 * Returns cached events when available, fetches fresh data periodically.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();

    const { searchParams } = new URL(request.url);
    const startDate = new Date(searchParams.get("start") || new Date().toISOString());
    const endDate = new Date(
      searchParams.get("end") || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
    );

    // Check if Google Calendar is connected
    const connected = await isGoogleCalendarConnected(userId);
    if (!connected) {
      return NextResponse.json({ events: [], connected: false });
    }

    // Fetch fresh events from Google Calendar
    const events = await fetchGoogleCalendarEvents(startDate, endDate, userId);

    return NextResponse.json({
      events: events.map((e) => ({
        ...e,
        start: e.start.toISOString(),
        end: e.end?.toISOString(),
      })),
      connected: true,
      lastSync: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[Google Calendar Sync] Failed:", error);
    return NextResponse.json(
      { error: "Failed to sync Google Calendar" },
      { status: 500 }
    );
  }
}
