import { describe, it, expect, vi, beforeEach } from "vitest";
import { proxy } from "@/proxy";
import { NextRequest } from "next/server";

const mockGetUser = vi.fn();
const mockGetSession = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
      getSession: mockGetSession,
    },
  })),
}));

describe("Proxy Session Verification (src/proxy.ts)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("verifies sessions with server-verified getUser() and NEVER with unverified getSession()", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });

    const request = new NextRequest("http://localhost:3000/today");
    const response = await proxy(request);

    expect(response).toBeDefined();
    expect(mockGetUser).toHaveBeenCalledTimes(1);
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it("bypasses proxy for service worker, cron, and offline pages without checking session", async () => {
    const swRequest = new NextRequest("http://localhost:3000/sw.js");
    await proxy(swRequest);

    const cronRequest = new NextRequest("http://localhost:3000/api/cron/maintenance");
    await proxy(cronRequest);

    const triggerRequest = new NextRequest("http://localhost:3000/api/notifications/trigger");
    await proxy(triggerRequest);

    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it("returns 401 JSON for unauthenticated /api/ requests", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: new Error("No session"),
    });

    const request = new NextRequest("http://localhost:3000/api/courses");
    const response = await proxy(request);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("redirects unauthenticated page requests to /login", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const request = new NextRequest("http://localhost:3000/today");
    const response = await proxy(request);

    expect(response.status).toBe(307); // NextResponse.redirect
    expect(response.headers.get("location")).toContain("/login");
  });

  it("redirects authenticated user away from /login to /today", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });

    const request = new NextRequest("http://localhost:3000/login");
    const response = await proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/today");
  });
});
