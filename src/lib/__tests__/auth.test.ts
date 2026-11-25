import { describe, it, expect, vi, beforeEach } from "vitest";
import { getCurrentUserId, UnauthorizedError } from "@/lib/auth";
import { createClient } from "@/features/auth/lib/supabase-server";

const mockHeadersGet = vi.fn();
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: mockHeadersGet,
  })),
}));

vi.mock("@/features/auth/lib/supabase-server", () => ({
  createClient: vi.fn(),
}));

describe("Auth Helper (getCurrentUserId)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHeadersGet.mockReturnValue(null);
  });

  it("fast-paths directly from verified x-user-id header without calling Supabase", async () => {
    mockHeadersGet.mockReturnValue("fast-path-user-999");
    const userId = await getCurrentUserId();
    expect(userId).toBe("fast-path-user-999");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("throws UnauthorizedError when no active session exists", async () => {
    (createClient as any).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: new Error("No session"),
        }),
      },
    });

    await expect(getCurrentUserId()).rejects.toThrow(UnauthorizedError);
  });

  it("throws UnauthorizedError when user object has no id", async () => {
    (createClient as any).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: {} },
          error: null,
        }),
      },
    });

    await expect(getCurrentUserId()).rejects.toThrow(UnauthorizedError);
  });

  it("returns user ID when authenticated session exists", async () => {
    (createClient as any).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-abc-123" } },
          error: null,
        }),
      },
    });

    const userId = await getCurrentUserId();
    expect(userId).toBe("user-abc-123");
  });

  it("does not leak session across distinct requests", async () => {
    // Request 1: User A
    (createClient as any).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-A" } },
          error: null,
        }),
      },
    });
    const userA = await getCurrentUserId();
    expect(userA).toBe("user-A");

    // Request 2: User B
    (createClient as any).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-B" } },
          error: null,
        }),
      },
    });
    const userB = await getCurrentUserId();
    expect(userB).toBe("user-B");
    expect(userB).not.toBe(userA);
  });
});
