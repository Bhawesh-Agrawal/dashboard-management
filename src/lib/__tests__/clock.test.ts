import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getNow,
  getNowMs,
  getNowIso,
  withSimulatedTime,
  isSimulated,
  isProductionEnv,
} from "../clock";

describe("Request-Scoped Injectable Clock (src/lib/clock.ts)", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDeployEnv = process.env.DEPLOY_ENV;

  beforeEach(() => {
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

  describe("Non-production environment", () => {
    it("defaults to real system time when outside withSimulatedTime()", () => {
      expect(isSimulated()).toBe(false);
      const before = Date.now();
      const now = getNow().getTime();
      const after = Date.now();
      expect(now).toBeGreaterThanOrEqual(before);
      expect(now).toBeLessThanOrEqual(after);
    });

    it("scopes simulated time strictly within withSimulatedTime() callback", async () => {
      const targetIso = "2026-06-15T09:30:00.000Z";

      await withSimulatedTime(targetIso, async () => {
        expect(isSimulated()).toBe(true);
        expect(getNowIso()).toBe(targetIso);
        expect(getNow().toISOString()).toBe(targetIso);
        expect(getNowMs()).toBe(new Date(targetIso).getTime());
      });

      // Outside callback, must revert to real time
      expect(isSimulated()).toBe(false);
      expect(Math.abs(getNow().getTime() - Date.now())).toBeLessThan(1000);
    });

    it("does not leak simulated time when callback throws an error", async () => {
      const targetIso = "2026-01-01T00:00:00.000Z";

      await expect(
        withSimulatedTime(targetIso, async () => {
          expect(isSimulated()).toBe(true);
          throw new Error("Deliberate failure inside handler");
        })
      ).rejects.toThrow("Deliberate failure inside handler");

      // Verify simulated time did not leak after throwing
      expect(isSimulated()).toBe(false);
      expect(Math.abs(getNow().getTime() - Date.now())).toBeLessThan(1000);
    });

    it("ensures two concurrent operations, one with simulated time and one without, do not affect each other", async () => {
      const simulatedIso = "2026-12-25T12:00:00.000Z";

      let capturedTimeInSimulated: string | null = null;
      let capturedTimeInReal: number | null = null;

      // Run two concurrent asynchronous operations
      await Promise.all([
        // Task A: simulated time with artificial delay
        withSimulatedTime(simulatedIso, async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          capturedTimeInSimulated = getNowIso();
        }),
        // Task B: real time with artificial delay
        (async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          capturedTimeInReal = getNow().getTime();
        })(),
      ]);

      expect(capturedTimeInSimulated).toBe(simulatedIso);
      expect(Math.abs(capturedTimeInReal! - Date.now())).toBeLessThan(1000);
    });

    it("throws an error when an invalid date string is provided", async () => {
      await expect(
        withSimulatedTime("not-a-valid-date", async () => {
          return "ok";
        })
      ).rejects.toThrow("Invalid date provided to withSimulatedTime");
    });
  });

  describe("Production environment protection", () => {
    it("refuses withSimulatedTime when NODE_ENV is production", async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      expect(isProductionEnv()).toBe(true);

      await expect(
        withSimulatedTime("2026-01-01T00:00:00.000Z", async () => {
          return "ok";
        })
      ).rejects.toThrow("Simulated clock cannot be set in production environment.");
    });

    it("refuses withSimulatedTime when DEPLOY_ENV is production", async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = "development";
      process.env.DEPLOY_ENV = "production";
      expect(isProductionEnv()).toBe(true);

      await expect(
        withSimulatedTime("2026-01-01T00:00:00.000Z", async () => {
          return "ok";
        })
      ).rejects.toThrow("Simulated clock cannot be set in production environment.");
    });
  });
});
