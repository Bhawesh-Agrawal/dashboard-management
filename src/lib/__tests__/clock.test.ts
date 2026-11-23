import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getNow,
  getNowMs,
  getNowIso,
  setSimulatedTime,
  resetClock,
  isSimulated,
  isProductionEnv,
} from "../clock";

describe("Injectable Clock (src/lib/clock.ts)", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDeployEnv = process.env.DEPLOY_ENV;

  beforeEach(() => {
    resetClock();
    (process.env as Record<string, string | undefined>).NODE_ENV = "test";
    delete process.env.DEPLOY_ENV;
  });

  afterEach(() => {
    resetClock();
    (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
    if (originalDeployEnv !== undefined) {
      process.env.DEPLOY_ENV = originalDeployEnv;
    } else {
      delete process.env.DEPLOY_ENV;
    }
  });

  describe("Non-production environment", () => {
    it("defaults to real system time when no simulated time is set", () => {
      expect(isSimulated()).toBe(false);
      const before = Date.now();
      const now = getNow().getTime();
      const after = Date.now();
      expect(now).toBeGreaterThanOrEqual(before);
      expect(now).toBeLessThanOrEqual(after);
    });

    it("allows setting simulated time from an ISO string", () => {
      const targetIso = "2026-06-15T09:30:00.000Z";
      setSimulatedTime(targetIso);

      expect(isSimulated()).toBe(true);
      expect(getNowIso()).toBe(targetIso);
      expect(getNow().toISOString()).toBe(targetIso);
      expect(getNowMs()).toBe(new Date(targetIso).getTime());
    });

    it("allows setting simulated time from a Date instance", () => {
      const targetDate = new Date("2026-11-20T14:45:00.000Z");
      setSimulatedTime(targetDate);

      expect(isSimulated()).toBe(true);
      expect(getNow().getTime()).toBe(targetDate.getTime());
    });

    it("resets back to real system time when resetClock() is called", () => {
      setSimulatedTime("2026-01-01T00:00:00.000Z");
      expect(isSimulated()).toBe(true);

      resetClock();
      expect(isSimulated()).toBe(false);
      const diff = Math.abs(getNow().getTime() - Date.now());
      expect(diff).toBeLessThan(1000);
    });

    it("throws an error when an invalid date string is provided", () => {
      expect(() => setSimulatedTime("invalid-date-format")).toThrow(
        "Invalid date provided to setSimulatedTime"
      );
    });
  });

  describe("Production environment protection", () => {
    it("refuses to set simulated time when NODE_ENV is production", () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      expect(isProductionEnv()).toBe(true);

      expect(() => setSimulatedTime("2026-01-01T00:00:00.000Z")).toThrow(
        "Simulated clock cannot be set in production environment."
      );
    });

    it("refuses to set simulated time when DEPLOY_ENV is production", () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = "development";
      process.env.DEPLOY_ENV = "production";
      expect(isProductionEnv()).toBe(true);

      expect(() => setSimulatedTime("2026-01-01T00:00:00.000Z")).toThrow(
        "Simulated clock cannot be set in production environment."
      );
    });

    it("always returns real system time in production even if simulated time was somehow set", () => {
      // First set in test mode
      setSimulatedTime("2020-01-01T00:00:00.000Z");

      // Switch to production
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      expect(isSimulated()).toBe(false);

      const now = getNow();
      // Should be current real year (not 2020)
      expect(now.getUTCFullYear()).toBeGreaterThanOrEqual(2026);
    });
  });
});
