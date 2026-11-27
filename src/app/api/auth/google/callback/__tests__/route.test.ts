import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockGetUser, mockExchangeCodeForTokens, mockStoreAccountTokens } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockExchangeCodeForTokens: vi.fn(),
  mockStoreAccountTokens: vi.fn(),
}));

vi.mock("@/features/auth/lib/supabase-server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}));

vi.mock("@/features/calendar/lib/google-calendar", () => ({
  exchangeCodeForTokens: mockExchangeCodeForTokens,
  storeAccountTokens: mockStoreAccountTokens,
}));

import { GET } from "../route";

describe("GET /api/auth/google/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.GOOGLE_CALENDAR_REDIRECT_URI;
  });

  it("redirects to x-forwarded-host/proto instead of 0.0.0.0 on success", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockExchangeCodeForTokens.mockResolvedValue({
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: new Date(Date.now() + 3600_000),
      googleAccountId: "g-123",
      email: "user@example.com",
    });
    mockStoreAccountTokens.mockResolvedValue(undefined);

    const req = new NextRequest("http://0.0.0.0:8080/api/auth/google/callback?code=auth-code", {
      headers: {
        "x-forwarded-host": "dashboard-management-862005715307.asia-south1.run.app",
        "x-forwarded-proto": "https",
        host: "0.0.0.0:8080",
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://dashboard-management-862005715307.asia-south1.run.app/settings?success=google_calendar_connected"
    );
    expect(mockStoreAccountTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        googleAccountId: "g-123",
        email: "user@example.com",
      })
    );
  });

  it("redirects error responses using forwarded origin instead of 0.0.0.0", async () => {
    const req = new NextRequest(
      "http://0.0.0.0:8080/api/auth/google/callback?error=access_denied",
      {
        headers: {
          "x-forwarded-host": "dashboard-management-862005715307.asia-south1.run.app",
          "x-forwarded-proto": "https",
        },
      }
    );

    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://dashboard-management-862005715307.asia-south1.run.app/settings?error=google_calendar_auth_failed"
    );
  });

  it("falls back to GOOGLE_CALENDAR_REDIRECT_URI origin when host is 0.0.0.0", async () => {
    process.env.GOOGLE_CALENDAR_REDIRECT_URI =
      "https://dashboard-management-862005715307.asia-south1.run.app/api/auth/google/callback";

    const req = new NextRequest("http://0.0.0.0:8080/api/auth/google/callback", {
      headers: { host: "0.0.0.0:8080" },
    });

    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://dashboard-management-862005715307.asia-south1.run.app/settings?error=no_code"
    );
  });
});
