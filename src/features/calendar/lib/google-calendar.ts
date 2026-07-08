import type { calendar_v3 } from "googleapis";
import { prisma } from "@/lib/prisma";

/**
 * Google Calendar API client for read-only sync.
 *
 * This module handles:
 * - OAuth 2.0 flow for authentication
 * - Fetching events from Google Calendar (primary + Birthdays)
 * - Token refresh when expired
 *
 * IMPORTANT: This is read-only — never writes to or modifies the user's Google Calendar.
 */

const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];

/**
 * Get the OAuth2 client with credentials from environment.
 */
async function getOAuth2Client() {
  const { google } = await import("googleapis");
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI || "http://localhost:3000/api/auth/google/callback";

  if (!clientId || !clientSecret) {
    throw new Error("Google Calendar credentials not configured");
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Generate the OAuth consent URL for Google Calendar access.
 */
export async function getAuthUrl(): Promise<string> {
  const oauth2Client = await getOAuth2Client();

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
}

/**
 * Exchange an authorization code for tokens.
 */
export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const oauth2Client = await getOAuth2Client();

  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error("Failed to get tokens from Google");
  }

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expiry_date || 3600000,
  };
}

/**
 * Store the Google Calendar tokens in the database.
 */
export async function storeTokens(
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
  userId: string
): Promise<void> {
  const expiresAt = new Date(Date.now() + expiresIn);

  await prisma.googleCalendarToken.upsert({
    where: { userId },
    create: {
      userId,
      accessToken,
      refreshToken,
      expiresAt,
    },
    update: {
      accessToken,
      refreshToken,
      expiresAt,
    },
  });
}

/**
 * Get a valid OAuth2 client, refreshing tokens if needed.
 * Returns null if not connected or table doesn't exist.
 */
async function getAuthenticatedClient(userId: string): Promise<calendar_v3.Calendar | null> {
  try {
    const tokenRecord = await prisma.googleCalendarToken.findUnique({
      where: { userId },
    });

    if (!tokenRecord) {
      return null;
    }

  const oauth2Client = await getOAuth2Client();

  // Check if token is expired
  if (new Date() >= tokenRecord.expiresAt) {
    try {
      oauth2Client.setCredentials({
        refresh_token: tokenRecord.refreshToken,
      });

      const { credentials } = await oauth2Client.refreshAccessToken();

      // Update stored tokens
      await prisma.googleCalendarToken.update({
        where: { userId },
        data: {
          accessToken: credentials.access_token || tokenRecord.accessToken,
          expiresAt: new Date(credentials.expiry_date || Date.now() + 3600000),
        },
      });

      oauth2Client.setCredentials({
        access_token: credentials.access_token,
        refresh_token: credentials.refresh_token,
      });
    } catch (error) {
      console.error("Failed to refresh Google Calendar token:", error);
      // Token refresh failed — user needs to re-authenticate
      return null;
    }
  } else {
    oauth2Client.setCredentials({
      access_token: tokenRecord.accessToken,
      refresh_token: tokenRecord.refreshToken,
    });
  }

  const { google } = await import("googleapis");
  return google.calendar({ version: "v3", auth: oauth2Client });
  } catch {
    // Table may not exist or token refresh failed
    return null;
  }
}

/**
 * Get the list of calendars the user has access to.
 * Used to show which calendars are being synced (primary + Birthdays).
 */
export async function getCalendarList(
  userId: string
): Promise<{ id: string; summary: string; primary: boolean }[]> {
  const calendar = await getAuthenticatedClient(userId);
  if (!calendar) return [];

  try {
    const response = await calendar.calendarList.list({
      maxResults: 50,
    });

    return (response.data.items || []).map((cal) => ({
      id: cal.id || "",
      summary: cal.summary || "Untitled Calendar",
      primary: cal.primary ?? false,
    }));
  } catch (error) {
    console.error("Failed to fetch Google Calendar list:", error);
    return [];
  }
}

/**
 * Check if a calendar ID is the Birthdays calendar.
 * Google exposes birthdays on a separate calendar, historically:
 * - addressbook#contacts@group.v.calendar.google.com
 * - Or a "Birthdays" calendar from calendarList on newer accounts
 */
function isBirthdaysCalendar(calendarId: string, summary: string): boolean {
  const lowerId = calendarId.toLowerCase();
  const lowerSummary = summary.toLowerCase();
  return (
    lowerId.includes("addressbook#contacts") ||
    lowerId.includes("birthday") ||
    lowerSummary === "birthdays"
  );
}

/**
 * Detect if an event is a birthday by its title pattern.
 * On newer Google accounts, birthdays from contacts appear directly
 * on the primary calendar (not a separate Birthdays calendar),
 * so we can't rely solely on calendar source detection.
 *
 * Matches patterns like:
 * - "Krishna Goyal's birthday"
 * - "Krishna Goyal's Birthday"
 * - "🎂 Krishna Goyal"
 */
function isBirthdayByTitle(title: string): boolean {
  const lower = title.toLowerCase();
  return lower.includes("'s birthday") || lower.includes(" birthday");
}

/**
 * Fetch events from Google Calendar for a date range.
 * Fetches from both primary and Birthdays calendars.
 * Birthday events are tagged with isBirthday: true.
 */
export async function fetchGoogleCalendarEvents(
  timeMin: Date,
  timeMax: Date,
  userId: string
): Promise<
  {
    id: string;
    title: string;
    start: Date;
    end: Date | null;
    location: string | null;
    description: string | null;
    htmlLink: string;
    isBirthday: boolean;
    calendarId: string;
  }[]
> {
  const calendar = await getAuthenticatedClient(userId);

  if (!calendar) {
    return [];
  }

  try {
    // First, get the list of calendars to find the Birthdays calendar
    const calList = await calendar.calendarList.list({ maxResults: 50 });
    const calendars = calList.data.items || [];

    const birthdayCalendars = calendars.filter((cal) =>
      isBirthdaysCalendar(cal.id || "", cal.summary || "")
    );

    // Collect events from all relevant calendars
    const allEvents: {
      id: string;
      title: string;
      start: Date;
      end: Date | null;
      location: string | null;
      description: string | null;
      htmlLink: string;
      isBirthday: boolean;
      calendarId: string;
    }[] = [];

    // Fetch from primary calendar
    const primaryResponse = await calendar.events.list({
      calendarId: "primary",
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 100,
    });

    for (const event of primaryResponse.data.items || []) {
      const title = event.summary || "Untitled Event";
      // Detect birthday by title pattern OR calendar source
      const birthday = isBirthdayByTitle(title);
      allEvents.push({
        id: event.id || "",
        title,
        start: new Date(event.start?.dateTime || event.start?.date || ""),
        end: event.end?.dateTime ? new Date(event.end.dateTime) : null,
        location: event.location || null,
        description: event.description || null,
        htmlLink: event.htmlLink || "",
        isBirthday: birthday,
        calendarId: "primary",
      });
    }

    // Fetch from Birthdays calendar(s)
    for (const bdayCal of birthdayCalendars) {
      try {
        const bdayResponse = await calendar.events.list({
          calendarId: bdayCal.id!,
          timeMin: timeMin.toISOString(),
          timeMax: timeMax.toISOString(),
          singleEvents: true,
          orderBy: "startTime",
          maxResults: 50,
        });

        for (const event of bdayResponse.data.items || []) {
          allEvents.push({
            id: `bday-${event.id}`,
            title: event.summary || "Birthday",
            start: new Date(event.start?.dateTime || event.start?.date || ""),
            end: event.end?.dateTime ? new Date(event.end.dateTime) : null,
            location: event.location || null,
            description: event.description || null,
            htmlLink: event.htmlLink || "",
            isBirthday: true,
            calendarId: bdayCal.id!,
          });
        }
      } catch (err) {
        console.error(`Failed to fetch from Birthdays calendar ${bdayCal.id}:`, err);
      }
    }

    return allEvents;
  } catch (error) {
    console.error("Failed to fetch Google Calendar events:", error);
    return [];
  }
}

/**
 * Check if Google Calendar is connected.
 * Cached for 5 minutes — this is called on every dashboard load.
 * Returns false if the table doesn't exist yet.
 */
export async function isGoogleCalendarConnected(userId: string): Promise<boolean> {
  const { memCache, TTL } = await import("@/lib/mem-cache");
  return memCache.get(`googleConnected:${userId}`, TTL.AUTH, async () => {
    try {
      const token = await prisma.googleCalendarToken.findUnique({
        where: { userId },
        select: { userId: true }, // minimal select
      });
      return !!token;
    } catch {
      return false;
    }
  });
}

/**
 * Disconnect Google Calendar (delete stored tokens).
 * Silently fails if the table doesn't exist yet.
 */
export async function disconnectGoogleCalendar(userId: string): Promise<void> {
  try {
    await prisma.googleCalendarToken.deleteMany({
      where: { userId },
    });
  } catch {
    // Table may not exist yet — silently succeed
  }
}
