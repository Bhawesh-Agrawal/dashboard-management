import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetCurrentUserId = vi.fn();
const mockSend = vi.fn();

vi.mock("@/lib/auth", () => ({
  getCurrentUserId: () => mockGetCurrentUserId(),
}));

vi.mock("@/lib/s3/client", () => ({
  BUCKET_NAME: "test-bucket",
  getS3Client: () => ({
    send: (...args: unknown[]) => mockSend(...args),
  }),
}));

import { GET } from "../storage/route";

describe("GET /api/health/storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUserId.mockRejectedValue(new Error("Unauthorized"));
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 200 when S3 bucket HEAD and list succeed", async () => {
    mockGetCurrentUserId.mockResolvedValue("user-1");
    mockSend.mockResolvedValue({});
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, reachable: true, bucket: "test-bucket" });
  });

  it("returns 503 when S3 endpoint is unreachable", async () => {
    mockGetCurrentUserId.mockResolvedValue("user-1");
    mockSend.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain("storage offline");
  });
});
