import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "../route";
import { getNow, isSimulated } from "@/lib/clock";

// Mock dependencies
vi.mock("@/lib/cron-auth", () => ({
  verifyCronRequest: vi.fn(),
}));

vi.mock("@/features/notifications/lib/scheduler", () => ({
  runNotificationScheduler: vi.fn().mockResolvedValue(undefined),
}));

import { verifyCronRequest } from "@/lib/cron-auth";
import { runNotificationScheduler } from "@/features/notifications/lib/scheduler";

describe("/api/notifications/trigger with asOf simulation", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDeployEnv = process.env.DEPLOY_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    (process.env as Record<string, string | undefined>).NODE_ENV = "test";
    delete process.env.DEPLOY_ENV;
  });

  afterEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
    if (originalDeployEnv !== undefined) {
      process.env.DEPLOY_ENV = originalDeployEnv;
    } else {
      delete process.env.DEPLOY_ENV;
    }
  });

  it("returns 401 when request is not authorized", async () => {
    vi.mocked(verifyCronRequest).mockResolvedValueOnce(false);

    const req = new Request("http://localhost:3000/api/notifications/trigger");
    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  describe("Non-production environment", () => {
    it("accepts asOf ISO timestamp and simulates time during scheduler run", async () => {
      vi.mocked(verifyCronRequest).mockResolvedValueOnce(true);

      const simulatedIso = "2026-09-01T08:00:00.000Z";
      let capturedTimeDuringRun: string | null = null;

      vi.mocked(runNotificationScheduler).mockImplementationOnce(async () => {
        capturedTimeDuringRun = getNow().toISOString();
      });

      const req = new Request(
        `http://localhost:3000/api/notifications/trigger?asOf=${encodeURIComponent(simulatedIso)}`
      );
      const res = await GET(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.timestamp).toBe(simulatedIso);
      expect(capturedTimeDuringRun).toBe(simulatedIso);

      // Verify clock was reset after request completes
      expect(isSimulated()).toBe(false);
    });

    it("does not leak simulated time when scheduler throws an error", async () => {
      vi.mocked(verifyCronRequest).mockResolvedValueOnce(true);

      vi.mocked(runNotificationScheduler).mockRejectedValueOnce(new Error("Scheduler failure"));

      const req = new Request(
        "http://localhost:3000/api/notifications/trigger?asOf=2026-09-01T08:00:00.000Z"
      );
      const res = await GET(req);

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error).toBe("Scheduler failure");

      // Verify clock is not simulated after error
      expect(isSimulated()).toBe(false);
    });

    it("handles two concurrent requests (one with asOf and one without) without interference", async () => {
      vi.mocked(verifyCronRequest).mockResolvedValue(true);

      const simulatedIso = "2026-11-01T09:00:00.000Z";
      let capturedTimeWithAsOf: string | null = null;
      let capturedTimeWithoutAsOf: number | null = null;

      vi.mocked(runNotificationScheduler).mockImplementation(async () => {
        // Delay slightly to ensure overlapping execution
        await new Promise((resolve) => setTimeout(resolve, 30));
        if (isSimulated()) {
          capturedTimeWithAsOf = getNow().toISOString();
        } else {
          capturedTimeWithoutAsOf = getNow().getTime();
        }
      });

      const reqWithAsOf = new Request(
        `http://localhost:3000/api/notifications/trigger?asOf=${encodeURIComponent(simulatedIso)}`
      );
      const reqWithoutAsOf = new Request("http://localhost:3000/api/notifications/trigger");

      const [resWithAsOf, resWithoutAsOf] = await Promise.all([
        GET(reqWithAsOf),
        GET(reqWithoutAsOf),
      ]);

      expect(resWithAsOf.status).toBe(200);
      expect(resWithoutAsOf.status).toBe(200);

      const bodyWithAsOf = await resWithAsOf.json();
      expect(bodyWithAsOf.timestamp).toBe(simulatedIso);
      expect(capturedTimeWithAsOf).toBe(simulatedIso);

      expect(capturedTimeWithoutAsOf).not.toBeNull();
      expect(Math.abs(capturedTimeWithoutAsOf! - Date.now())).toBeLessThan(1000);

      expect(isSimulated()).toBe(false);
    });

    it("returns 400 when asOf timestamp is invalid", async () => {
      vi.mocked(verifyCronRequest).mockResolvedValueOnce(true);

      const req = new Request("http://localhost:3000/api/notifications/trigger?asOf=not-a-date");
      const res = await GET(req);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Invalid asOf timestamp");
      expect(runNotificationScheduler).not.toHaveBeenCalled();
    });

    it("runs without asOf and uses current time", async () => {
      vi.mocked(verifyCronRequest).mockResolvedValueOnce(true);

      const req = new Request("http://localhost:3000/api/notifications/trigger");
      const res = await GET(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(runNotificationScheduler).toHaveBeenCalledWith(false);
    });
  });

  describe("Production environment", () => {
    it("rejects asOf parameter with 400 when NODE_ENV is production", async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      vi.mocked(verifyCronRequest).mockResolvedValueOnce(true);

      const req = new Request(
        "http://localhost:3000/api/notifications/trigger?asOf=2026-09-01T08:00:00.000Z"
      );
      const res = await GET(req);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("asOf parameter is not permitted in production");
      expect(runNotificationScheduler).not.toHaveBeenCalled();
    });

    it("rejects asOf parameter with 400 when DEPLOY_ENV is production", async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = "development";
      process.env.DEPLOY_ENV = "production";
      vi.mocked(verifyCronRequest).mockResolvedValueOnce(true);

      const req = new Request(
        "http://localhost:3000/api/notifications/trigger?asOf=2026-09-01T08:00:00.000Z"
      );
      const res = await GET(req);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("asOf parameter is not permitted in production");
      expect(runNotificationScheduler).not.toHaveBeenCalled();
    });

    it("succeeds in production when no asOf parameter is provided", async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      vi.mocked(verifyCronRequest).mockResolvedValueOnce(true);

      const req = new Request("http://localhost:3000/api/notifications/trigger");
      const res = await GET(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(runNotificationScheduler).toHaveBeenCalledWith(false);
    });
  });
});
