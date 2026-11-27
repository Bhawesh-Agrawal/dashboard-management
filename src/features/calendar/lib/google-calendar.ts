import type { calendar_v3 } from "googleapis";
import { prisma } from "@/lib/prisma";
import { memCache, TTL } from "@/lib/mem-cache";

/**
 * Google Calendar API client for read-only multi-account, multi-calendar sync.
 *
 * This module handles:
 * - OAuth 2.0 flow for connecting one or more Google accounts
 * - Per-account calendar discovery & subscription toggling
 * - Fetching events across all enabled calendars of all connected accounts
 * - Token refresh when expired + cache invalidation on state changes
 *
 * IMPORTANT: This is read-only — never writes to or modifies the user's Google Calendar.
 */

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

const CONNECTION_CACHE_KEY = (userId: string) => `googleConnected:${userId}`;

export interface ConnectedCalendarInfo {
  id: string;
  calendarId: string;
  summary: string;
  color: string | null;
  isPrimary: boolean;
  isBirthday: boolean;
  enabled: boolean;
}

export interface ConnectedGoogleAccountInfo {
  id: string;
  googleAccountId: string;
  email: string;
  label: string | null;
  calendars: ConnectedCalendarInfo[];
}

export interface FetchedGoogleEvent {
  id: string;
  title: string;
  start: Date;
  end: Date | null;
  isAllDay: boolean;
  location: string | null;
  description: string | null;
  htmlLink: string;
  isBirthday: boolean;
  calendarId: string;
  calendarName: string;
  calendarColor: string | null;
  accountEmail: string;
}

function invalidateConnectionCache(userId: string): void {
  memCache.invalidate(CONNECTION_CACHE_KEY(userId));
}

/**
 * Get the OAuth2 client with credentials from environment.
 */
async function getOAuth2Client() {
  const { google } = await import("googleapis");
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_CALENDAR_REDIRECT_URI ||
    "http://localhost:3000/api/auth/google/callback";

  if (!clientId || !clientSecret) {
    throw new Error("Google Calendar credentials not configured");
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Generate the OAuth consent URL for Google Calendar access.
 * Uses `select_account` so users can connect additional Google accounts.
 */
export async function getAuthUrl(): Promise<string> {
  const oauth2Client = await getOAuth2Client();

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent select_account",
  });
}

/**
 * Exchange an authorization code for tokens and resolve the Google account identity.
 */
export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  googleAccountId: string;
  email: string;
}> {
  const { google } = await import("googleapis");
  const oauth2Client = await getOAuth2Client();

  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.access_token) {
    throw new Error("Failed to get access token from Google");
  }

  oauth2Client.setCredentials(tokens);

  let googleAccountId = "";
  let email = "";

  try {
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();
    googleAccountId = userInfo.id || userInfo.email || "";
    email = userInfo.email || "";
  } catch (err) {
    console.warn("Failed to fetch Google userinfo, falling back to primary calendar:", err);
  }

  if (!googleAccountId || !email) {
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const calList = await calendar.calendarList.list({ maxResults: 10 });
    const primary = calList.data.items?.find((c) => c.primary) || calList.data.items?.[0];
    googleAccountId = googleAccountId || primary?.id || "primary";
    email = email || primary?.id || "Google Account";
  }

  const expiresAt = tokens.expiry_date
    ? new Date(tokens.expiry_date)
    : new Date(Date.now() + 3600 * 1000);

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || null,
    expiresAt,
    googleAccountId,
    email,
  };
}

/**
 * Check if a calendar ID or summary represents a Birthdays calendar.
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
 */
function isBirthdayByTitle(title: string): boolean {
  const lower = title.toLowerCase();
  return lower.includes("'s birthday") || lower.includes(" birthday");
}

/**
 * Build an authenticated Google Calendar v3 client for an account record,
 * refreshing the access token if expired.
 */
async function getAuthenticatedClientForRecord(record: {
  id: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}, isLegacy: boolean): Promise<calendar_v3.Calendar | null> {
  try {
    const oauth2Client = await getOAuth2Client();

    if (new Date() >= record.expiresAt) {
      try {
        oauth2Client.setCredentials({
          refresh_token: record.refreshToken,
        });

        const { credentials } = await oauth2Client.refreshAccessToken();
        const nextAccessToken = credentials.access_token || record.accessToken;
        const nextExpiresAt = credentials.expiry_date
          ? new Date(credentials.expiry_date)
          : new Date(Date.now() + 3600 * 1000);

        if (isLegacy) {
          await prisma.googleCalendarToken.update({
            where: { userId: record.userId },
            data: { accessToken: nextAccessToken, expiresAt: nextExpiresAt },
          });
        } else {
          await prisma.googleCalendarAccount.update({
            where: { id: record.id },
            data: { accessToken: nextAccessToken, expiresAt: nextExpiresAt },
          });
        }

        oauth2Client.setCredentials({
          access_token: nextAccessToken,
          refresh_token: credentials.refresh_token || record.refreshToken,
        });
      } catch (error) {
        console.error("Failed to refresh Google Calendar token:", error);
        return null;
      }
    } else {
      oauth2Client.setCredentials({
        access_token: record.accessToken,
        refresh_token: record.refreshToken,
      });
    }

    const { google } = await import("googleapis");
    return google.calendar({ version: "v3", auth: oauth2Client });
  } catch {
    return null;
  }
}

/**
 * Fetch the calendarList for an account and upsert GoogleCalendarSubscription rows.
 * Primary and Birthdays calendars are enabled by default for newly discovered calendars;
 * existing user toggle states are preserved.
 */
async function syncSubscriptionsForAccount(
  account: {
    id: string;
    userId: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
  }
): Promise<void> {
  const calendar = await getAuthenticatedClientForRecord(account, false);
  if (!calendar) return;

  try {
    const response = await calendar.calendarList.list({ maxResults: 100 });
    const items = response.data.items || [];

    for (const cal of items) {
      if (!cal.id) continue;
      const summary = cal.summaryOverride || cal.summary || "Untitled Calendar";
      const isPrimary = cal.primary ?? false;
      const isBirthday = isBirthdaysCalendar(cal.id, summary);
      const color = cal.backgroundColor || null;

      await prisma.googleCalendarSubscription.upsert({
        where: {
          accountId_calendarId: {
            accountId: account.id,
            calendarId: cal.id,
          },
        },
        create: {
          userId: account.userId,
          accountId: account.id,
          calendarId: cal.id,
          summary,
          color,
          isPrimary,
          isBirthday,
          enabled: isPrimary || isBirthday,
        },
        update: {
          summary,
          color,
          isPrimary,
          isBirthday,
        },
      });
    }
  } catch (error) {
    console.error(`Failed to sync calendars for account ${account.id}:`, error);
  }
}

/**
 * Store tokens for a connected Google account, discover its calendars,
 * and invalidate the connection cache.
 */
export async function storeAccountTokens(params: {
  userId: string;
  googleAccountId: string;
  email: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
}): Promise<void> {
  const { userId, googleAccountId, email, accessToken, refreshToken, expiresAt } = params;

  const existing = await prisma.googleCalendarAccount.findUnique({
    where: { userId_googleAccountId: { userId, googleAccountId } },
    select: { refreshToken: true },
  });

  const resolvedRefreshToken = refreshToken || existing?.refreshToken;
  if (!resolvedRefreshToken) {
    throw new Error("Missing refresh token from Google");
  }

  const account = await prisma.googleCalendarAccount.upsert({
    where: { userId_googleAccountId: { userId, googleAccountId } },
    create: {
      userId,
      googleAccountId,
      email,
      accessToken,
      refreshToken: resolvedRefreshToken,
      expiresAt,
    },
    update: {
      email,
      accessToken,
      refreshToken: resolvedRefreshToken,
      expiresAt,
    },
  });

  await syncSubscriptionsForAccount(account);
  invalidateConnectionCache(userId);
}

/**
 * Migrate a legacy single-account GoogleCalendarToken row into GoogleCalendarAccount
 * if the user has no GoogleCalendarAccount rows yet.
 */
async function migrateLegacyTokenIfNeeded(userId: string) {
  try {
    const legacy = await prisma.googleCalendarToken.findUnique({
      where: { userId },
    });
    if (!legacy) return [];

    const calendar = await getAuthenticatedClientForRecord(legacy, true);
    let googleAccountId = "primary";
    let email = "Google Account";

    if (calendar) {
      try {
        const calList = await calendar.calendarList.list({ maxResults: 20 });
        const primary = calList.data.items?.find((c) => c.primary) || calList.data.items?.[0];
        if (primary?.id) {
          googleAccountId = primary.id;
          email = primary.id;
        }
      } catch {
        // Fallback to default identifiers
      }
    }

    const account = await prisma.googleCalendarAccount.upsert({
      where: { userId_googleAccountId: { userId, googleAccountId } },
      create: {
        userId,
        googleAccountId,
        email,
        accessToken: legacy.accessToken,
        refreshToken: legacy.refreshToken,
        expiresAt: legacy.expiresAt,
      },
      update: {},
    });

    await syncSubscriptionsForAccount(account);

    return prisma.googleCalendarAccount.findMany({
      where: { userId },
      include: {
        calendars: {
          orderBy: [{ isPrimary: "desc" }, { summary: "asc" }],
        },
      },
      orderBy: { createdAt: "asc" },
    });
  } catch {
    return [];
  }
}

/**
 * List all connected Google accounts and their calendars for a user.
 */
export async function listConnectedAccounts(
  userId: string
): Promise<ConnectedGoogleAccountInfo[]> {
  try {
    let accounts = await prisma.googleCalendarAccount.findMany({
      where: { userId },
      include: {
        calendars: {
          orderBy: [{ isPrimary: "desc" }, { summary: "asc" }],
        },
      },
      orderBy: { createdAt: "asc" },
    });

    if (accounts.length === 0) {
      accounts = await migrateLegacyTokenIfNeeded(userId);
    }

    return accounts.map((acc) => ({
      id: acc.id,
      googleAccountId: acc.googleAccountId,
      email: acc.email,
      label: acc.label,
      calendars: acc.calendars.map((c) => ({
        id: c.id,
        calendarId: c.calendarId,
        summary: c.summary,
        color: c.color,
        isPrimary: c.isPrimary,
        isBirthday: c.isBirthday,
        enabled: c.enabled,
      })),
    }));
  } catch (error) {
    console.error("Failed to list connected Google accounts:", error);
    return [];
  }
}

/**
 * Refresh the calendar list for a specific connected Google account.
 */
export async function refreshAccountCalendars(
  accountId: string,
  userId: string
): Promise<void> {
  const account = await prisma.googleCalendarAccount.findFirst({
    where: { id: accountId, userId },
  });
  if (!account) return;
  await syncSubscriptionsForAccount(account);
  invalidateConnectionCache(userId);
}

/**
 * Enable or disable syncing for a specific calendar subscription.
 */
export async function toggleCalendarSubscription(
  subscriptionId: string,
  enabled: boolean,
  userId: string
): Promise<void> {
  await prisma.googleCalendarSubscription.updateMany({
    where: { id: subscriptionId, userId },
    data: { enabled },
  });
  invalidateConnectionCache(userId);
}

/**
 * Disconnect a single Google account (and cascade-delete its calendar subscriptions).
 */
export async function disconnectGoogleAccount(
  accountId: string,
  userId: string
): Promise<void> {
  await prisma.googleCalendarAccount.deleteMany({
    where: { id: accountId, userId },
  });

  const remaining = await prisma.googleCalendarAccount.count({
    where: { userId },
  });
  if (remaining === 0) {
    await prisma.googleCalendarToken.deleteMany({ where: { userId } }).catch(() => {});
  }

  invalidateConnectionCache(userId);
}

/**
 * Fetch events from a single Google calendar, handling pagination.
 */
async function fetchEventsForCalendar(
  calendar: calendar_v3.Calendar,
  sub: {
    id: string;
    accountId: string;
    calendarId: string;
    summary: string;
    color: string | null;
    isBirthday: boolean;
  },
  accountEmail: string,
  timeMin: Date,
  timeMax: Date
): Promise<FetchedGoogleEvent[]> {
  const results: FetchedGoogleEvent[] = [];
  let pageToken: string | undefined;
  let pages = 0;

  try {
    do {
      const response = await calendar.events.list({
        calendarId: sub.calendarId,
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 250,
        pageToken,
      });

      for (const event of response.data.items || []) {
        const title = event.summary || (sub.isBirthday ? "Birthday" : "Untitled Event");
        const isAllDay = !event.start?.dateTime;
        const startRaw = event.start?.dateTime || event.start?.date || "";
        if (!startRaw) continue;

        const endRaw = event.end?.dateTime || event.end?.date || null;
        const birthday = sub.isBirthday || isBirthdayByTitle(title);

        results.push({
          id: `${sub.accountId}-${sub.calendarId}-${event.id || title}`,
          title,
          start: new Date(startRaw),
          end: endRaw && !isAllDay ? new Date(endRaw) : null,
          isAllDay,
          location: event.location || null,
          description: event.description || null,
          htmlLink: event.htmlLink || "",
          isBirthday: birthday,
          calendarId: sub.calendarId,
          calendarName: sub.summary,
          calendarColor: sub.color,
          accountEmail,
        });
      }

      pageToken = response.data.nextPageToken || undefined;
      pages += 1;
    } while (pageToken && pages < 5);
  } catch (err) {
    console.error(`Failed to fetch events for calendar ${sub.calendarId}:`, err);
  }

  return results;
}

/**
 * Fetch events from all enabled calendars across all connected Google accounts.
 */
export async function fetchGoogleCalendarEvents(
  timeMin: Date,
  timeMax: Date,
  userId: string
): Promise<FetchedGoogleEvent[]> {
  try {
    let accounts = await prisma.googleCalendarAccount.findMany({
      where: { userId },
      include: {
        calendars: {
          where: { enabled: true },
        },
      },
    });

    if (accounts.length === 0) {
      const migrated = await migrateLegacyTokenIfNeeded(userId);
      accounts = migrated.map((acc) => ({
        ...acc,
        calendars: acc.calendars.filter((c) => c.enabled),
      }));
    }

    if (accounts.length === 0) {
      return [];
    }

    const accountBatches = await Promise.all(
      accounts.map(async (account) => {
        if (account.calendars.length === 0) return [];
        const calendar = await getAuthenticatedClientForRecord(account, false);
        if (!calendar) return [];

        const calEvents = await Promise.all(
          account.calendars.map((sub) =>
            fetchEventsForCalendar(calendar, sub, account.email, timeMin, timeMax)
          )
        );
        return calEvents.flat();
      })
    );

    return accountBatches.flat();
  } catch (error) {
    console.error("Failed to fetch Google Calendar events:", error);
    return [];
  }
}

/**
 * Check if any Google Calendar account is connected for the user.
 * Cached for 5 minutes and invalidated on connect/disconnect/toggle.
 */
export async function isGoogleCalendarConnected(userId: string): Promise<boolean> {
  return memCache.get(CONNECTION_CACHE_KEY(userId), TTL.AUTH, async () => {
    try {
      const accountCount = await prisma.googleCalendarAccount.count({
        where: { userId },
      });
      if (accountCount > 0) return true;

      const legacyToken = await prisma.googleCalendarToken.findUnique({
        where: { userId },
        select: { userId: true },
      });
      return !!legacyToken;
    } catch {
      return false;
    }
  });
}

/**
 * Disconnect all Google Calendar accounts and legacy tokens for a user.
 */
export async function disconnectGoogleCalendar(userId: string): Promise<void> {
  try {
    await prisma.googleCalendarAccount.deleteMany({ where: { userId } });
    await prisma.googleCalendarToken.deleteMany({ where: { userId } });
  } catch {
    // Tables may not exist yet — silently succeed
  } finally {
    invalidateConnectionCache(userId);
  }
}
