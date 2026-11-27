import { beforeEach, describe, expect, it, vi } from "vitest";
import { memCache } from "@/lib/mem-cache";

const {
  mockAccountCount,
  mockAccountFindUnique,
  mockAccountFindMany,
  mockAccountUpsert,
  mockAccountDeleteMany,
  mockSubUpsert,
  mockLegacyFindUnique,
  mockLegacyDeleteMany,
  mockCalendarList,
  mockEventsList,
} = vi.hoisted(() => ({
  mockAccountCount: vi.fn(),
  mockAccountFindUnique: vi.fn(),
  mockAccountFindMany: vi.fn(),
  mockAccountUpsert: vi.fn(),
  mockAccountDeleteMany: vi.fn(),
  mockSubUpsert: vi.fn(),
  mockLegacyFindUnique: vi.fn(),
  mockLegacyDeleteMany: vi.fn(),
  mockCalendarList: vi.fn(),
  mockEventsList: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    googleCalendarAccount: {
      count: mockAccountCount,
      findUnique: mockAccountFindUnique,
      findMany: mockAccountFindMany,
      upsert: mockAccountUpsert,
      deleteMany: mockAccountDeleteMany,
    },
    googleCalendarSubscription: {
      upsert: mockSubUpsert,
    },
    googleCalendarToken: {
      findUnique: mockLegacyFindUnique,
      deleteMany: mockLegacyDeleteMany,
    },
  },
}));

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(function () {
        return {
          setCredentials: vi.fn(),
          generateAuthUrl: vi.fn(),
        };
      }),
    },
    calendar: vi.fn(() => ({
      calendarList: { list: mockCalendarList },
      events: { list: mockEventsList },
    })),
  },
}));

import {
  isGoogleCalendarConnected,
  storeAccountTokens,
  fetchGoogleCalendarEvents,
  disconnectGoogleAccount,
} from "../google-calendar";

describe("google-calendar multi-account & multi-calendar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memCache.invalidateAll();
    process.env.GOOGLE_CALENDAR_CLIENT_ID = "client-id";
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "client-secret";
  });

  it("invalidates cached connection status when a new account is stored", async () => {
    mockAccountCount.mockResolvedValueOnce(0);
    mockLegacyFindUnique.mockResolvedValueOnce(null);
    expect(await isGoogleCalendarConnected("user-1")).toBe(false);

    mockAccountFindUnique.mockResolvedValueOnce(null);
    mockAccountUpsert.mockResolvedValueOnce({
      id: "acc-1",
      userId: "user-1",
      googleAccountId: "g-1",
      email: "personal@gmail.com",
      accessToken: "tok",
      refreshToken: "ref",
      expiresAt: new Date(Date.now() + 3600_000),
    });
    mockCalendarList.mockResolvedValueOnce({
      data: {
        items: [
          { id: "personal@gmail.com", summary: "Personal", primary: true, backgroundColor: "#4285f4" },
          { id: "work-cal", summary: "Work", primary: false, backgroundColor: "#0b8043" },
        ],
      },
    });
    mockSubUpsert.mockResolvedValue({});

    await storeAccountTokens({
      userId: "user-1",
      googleAccountId: "g-1",
      email: "personal@gmail.com",
      accessToken: "tok",
      refreshToken: "ref",
      expiresAt: new Date(Date.now() + 3600_000),
    });

    mockAccountCount.mockResolvedValueOnce(1);
    expect(await isGoogleCalendarConnected("user-1")).toBe(true);
    expect(mockSubUpsert).toHaveBeenCalledTimes(2);
  });

  it("aggregates events across multiple accounts and enabled calendars, including all-day events", async () => {
    const future = new Date(Date.now() + 3600_000);
    mockAccountFindMany.mockResolvedValueOnce([
      {
        id: "acc-1",
        userId: "user-1",
        email: "personal@gmail.com",
        accessToken: "tok-1",
        refreshToken: "ref-1",
        expiresAt: future,
        calendars: [
          {
            id: "sub-1",
            accountId: "acc-1",
            calendarId: "primary",
            summary: "Personal",
            color: "#4285f4",
            isBirthday: false,
          },
          {
            id: "sub-2",
            accountId: "acc-1",
            calendarId: "holidays",
            summary: "Holidays",
            color: "#0b8043",
            isBirthday: false,
          },
        ],
      },
      {
        id: "acc-2",
        userId: "user-1",
        email: "work@company.com",
        accessToken: "tok-2",
        refreshToken: "ref-2",
        expiresAt: future,
        calendars: [
          {
            id: "sub-3",
            accountId: "acc-2",
            calendarId: "primary",
            summary: "Work",
            color: "#d50000",
            isBirthday: false,
          },
        ],
      },
    ]);

    mockEventsList
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              id: "ev-1",
              summary: "Dentist",
              start: { dateTime: "2026-11-27T10:00:00Z" },
              end: { dateTime: "2026-11-27T11:00:00Z" },
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              id: "ev-2",
              summary: "Public Holiday",
              start: { date: "2026-11-28" },
              end: { date: "2026-11-29" },
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              id: "ev-3",
              summary: "Sprint Standup",
              start: { dateTime: "2026-11-27T09:00:00Z" },
              end: { dateTime: "2026-11-27T09:30:00Z" },
            },
          ],
        },
      });

    const events = await fetchGoogleCalendarEvents(
      new Date("2026-11-26T00:00:00Z"),
      new Date("2026-11-30T23:59:59Z"),
      "user-1"
    );

    expect(events).toHaveLength(3);
    expect(events.map((e) => e.title)).toEqual(["Dentist", "Public Holiday", "Sprint Standup"]);
    expect(events[1].isAllDay).toBe(true);
    expect(events[1].end).toBeNull();
    expect(events[2].accountEmail).toBe("work@company.com");
    expect(events[2].calendarColor).toBe("#d50000");
  });

  it("disconnects a single account and invalidates cache", async () => {
    mockAccountDeleteMany.mockResolvedValueOnce({ count: 1 });
    mockAccountCount.mockResolvedValueOnce(1);

    await disconnectGoogleAccount("acc-1", "user-1");

    expect(mockAccountDeleteMany).toHaveBeenCalledWith({
      where: { id: "acc-1", userId: "user-1" },
    });
    expect(mockLegacyDeleteMany).not.toHaveBeenCalled();
  });
});
