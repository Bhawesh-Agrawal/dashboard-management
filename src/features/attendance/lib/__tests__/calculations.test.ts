import { describe, it, expect } from "vitest";
import {
  computeAttendancePercent,
  computeCanMissClasses,
  computeMustAttendClasses,
  computeAttendanceMetrics,
  resolveAttendanceCounts,
  DEFAULT_ATTENDANCE_TARGET_PERCENT,
} from "../calculations";

describe("Attendance Calculations & Forecasting", () => {
  describe("computeAttendancePercent", () => {
    it("returns 0 when no classes have been held", () => {
      expect(computeAttendancePercent(0, 0)).toBe(0);
    });

    it("computes accurate percentage rounded to one decimal place", () => {
      expect(computeAttendancePercent(10, 0)).toBe(100);
      expect(computeAttendancePercent(9, 1)).toBe(90);
      expect(computeAttendancePercent(7, 3)).toBe(70);
      expect(computeAttendancePercent(2, 1)).toBe(66.7);
    });
  });

  describe("computeCanMissClasses", () => {
    it("returns 0 when total classes is 0 or current attendance is below target", () => {
      expect(computeCanMissClasses(0, 0, 75)).toBe(0);
      expect(computeCanMissClasses(6, 4, 75)).toBe(0); // 60% < 75%
      expect(computeCanMissClasses(7, 3, 75)).toBe(0); // 70% < 75%
    });

    it("calculates exact number of classes that can be missed while staying >= target", () => {
      // 20 present, 0 absent (100%), target 75%
      // 20 / (20 + 6) = 20 / 26 = 76.9% >= 75%
      // 20 / (20 + 7) = 20 / 27 = 74.1% < 75%
      expect(computeCanMissClasses(20, 0, 75)).toBe(6);

      // 15 present, 1 absent (93.75%), target 75%
      // 15 / (16 + 4) = 15 / 20 = 75.0% >= 75%
      // 15 / (16 + 5) = 15 / 21 = 71.4% < 75%
      expect(computeCanMissClasses(15, 1, 75)).toBe(4);

      // 15 present, 5 absent (75.0%), target 75%
      // 15 / 21 = 71.4% -> can miss 0
      expect(computeCanMissClasses(15, 5, 75)).toBe(0);
    });

    it("works with custom configurable target (e.g. 80% or 60%)", () => {
      // Target 80%: 10 present, 0 absent
      // 10 / (10 + 2) = 83.3% >= 80%
      // 10 / (10 + 3) = 76.9% < 80%
      expect(computeCanMissClasses(10, 0, 80)).toBe(2);

      // Target 60%: 10 present, 0 absent
      // 10 / (10 + 6) = 62.5% >= 60%
      // 10 / (10 + 7) = 58.8% < 60%
      expect(computeCanMissClasses(10, 0, 60)).toBe(6);
    });
  });

  describe("computeMustAttendClasses", () => {
    it("returns 0 when current attendance is already >= target", () => {
      expect(computeMustAttendClasses(20, 0, 75)).toBe(0);
      expect(computeMustAttendClasses(15, 5, 75)).toBe(0); // exactly 75%
      expect(computeMustAttendClasses(0, 0, 75)).toBe(0);
    });

    it("calculates exact number of consecutive classes required to reach target", () => {
      // 6 present, 4 absent (60%), target 75%
      // Attend 5: (6 + 5) / (10 + 5) = 11 / 15 = 73.3% < 75%
      // Attend 6: (6 + 6) / (10 + 6) = 12 / 16 = 75.0% >= 75%
      expect(computeMustAttendClasses(6, 4, 75)).toBe(6);

      // 1 present, 4 absent (20%), target 75%
      // Attend 8: 9 / 13 = 69.2%
      // Attend 9: 10 / 14 = 71.4%
      // Attend 11: 12 / 16 = 75.0%
      expect(computeMustAttendClasses(1, 4, 75)).toBe(11);
    });

    it("works with custom configurable target", () => {
      // Target 80%: 6 present, 4 absent (60%)
      // Deficit: 0.8 * 10 - 6 = 2
      // Needed: ceil(2 / 0.2) = 10
      // Check: (6 + 10) / (10 + 10) = 16 / 20 = 80.0%
      expect(computeMustAttendClasses(6, 4, 80)).toBe(10);
    });
  });

  describe("computeAttendanceMetrics (comprehensive)", () => {
    it("handles zero classes held edge case", () => {
      const metrics = computeAttendanceMetrics({ present: 0, absent: 0 });
      expect(metrics.totalCounted).toBe(0);
      expect(metrics.percent).toBe(0);
      expect(metrics.canMissCount).toBe(0);
      expect(metrics.mustAttendCount).toBe(0);
      expect(metrics.status).toBe("at_target");
    });

    it("handles all classes cancelled edge case", () => {
      const metrics = computeAttendanceMetrics({
        present: 0,
        absent: 0,
        cancelled: 6,
        unmarked: 2,
      });
      expect(metrics.totalCounted).toBe(0);
      expect(metrics.cancelled).toBe(6);
      expect(metrics.unmarked).toBe(2);
      expect(metrics.totalRecorded).toBe(8);
      expect(metrics.percent).toBe(0);
      expect(metrics.canMissCount).toBe(0);
      expect(metrics.mustAttendCount).toBe(0);
      expect(metrics.status).toBe("at_target");
    });

    it("computes above_target status with canMissCount", () => {
      const metrics = computeAttendanceMetrics({
        present: 18,
        absent: 2,
        targetPercent: DEFAULT_ATTENDANCE_TARGET_PERCENT,
      });
      expect(metrics.percent).toBe(90);
      expect(metrics.status).toBe("above_target");
      expect(metrics.canMissCount).toBe(4);
      expect(metrics.mustAttendCount).toBe(0);
    });

    it("computes below_target status with mustAttendCount", () => {
      const metrics = computeAttendanceMetrics({
        present: 5,
        absent: 5,
        targetPercent: DEFAULT_ATTENDANCE_TARGET_PERCENT,
      });
      expect(metrics.percent).toBe(50);
      expect(metrics.status).toBe("below_target");
      expect(metrics.canMissCount).toBe(0);
      expect(metrics.mustAttendCount).toBe(10);
    });
  });

  describe("resolveAttendanceCounts (Auto vs Manual Mode)", () => {
    it("resolves counts from manual mode inputs", () => {
      const counts = resolveAttendanceCounts({
        attendanceMode: "manual",
        manualPresent: 14,
        manualTotalClasses: 18,
      });
      expect(counts.present).toBe(14);
      expect(counts.absent).toBe(4);
      expect(counts.cancelled).toBe(0);
      expect(counts.unmarked).toBe(0);
    });

    it("resolves counts from auto mode attendance records", () => {
      const counts = resolveAttendanceCounts({
        attendanceMode: "auto",
        attendanceRecords: [
          { status: "present" },
          { status: "present" },
          { status: "absent" },
          { status: "cancelled" },
          { status: "not_marked" },
        ],
      });
      expect(counts.present).toBe(2);
      expect(counts.absent).toBe(1);
      expect(counts.cancelled).toBe(1);
      expect(counts.unmarked).toBe(1);
    });
  });

  describe("Cancellation Rule & Exception Precedence", () => {
    it("strictly excludes cancelled classes from attendance percentage calculation", () => {
      // 10 present, 0 absent, 15 cancelled: percent must be 100%, not 40%
      const metrics = computeAttendanceMetrics({
        present: 10,
        absent: 0,
        cancelled: 15,
        targetPercent: DEFAULT_ATTENDANCE_TARGET_PERCENT,
      });

      expect(metrics.percent).toBe(100);
      expect(metrics.totalCounted).toBe(10);
      expect(metrics.totalRecorded).toBe(25);
    });

    it("does not inflate or penalize canMissCount with cancelled classes", () => {
      // 20 present, 0 absent -> can miss 6 (75% target)
      const baseMetrics = computeAttendanceMetrics({
        present: 20,
        absent: 0,
        cancelled: 0,
      });

      // Same attendance with 50 cancelled classes added
      const withCancelled = computeAttendanceMetrics({
        present: 20,
        absent: 0,
        cancelled: 50,
      });

      expect(withCancelled.canMissCount).toBe(baseMetrics.canMissCount);
      expect(withCancelled.canMissCount).toBe(6);
    });

    it("does not alter mustAttendCount recovery deficit with cancelled classes", () => {
      // 5 present, 5 absent (50%) -> must attend 10
      const baseMetrics = computeAttendanceMetrics({
        present: 5,
        absent: 5,
        cancelled: 0,
      });

      // Same attendance with 20 cancelled classes
      const withCancelled = computeAttendanceMetrics({
        present: 5,
        absent: 5,
        cancelled: 20,
      });

      expect(withCancelled.mustAttendCount).toBe(baseMetrics.mustAttendCount);
      expect(withCancelled.mustAttendCount).toBe(10);
    });
  });
});
