import { describe, it, expect } from "vitest";
import {
  DEFAULT_TIMEZONE,
  formatDateOnly,
  parseDateOnly,
  getTodayInTimezone,
  getDayOfWeekInTimezone,
  getTimeInTimezone,
  getClassTimingStatus,
} from "../timezone";

describe("Timezone and Date Utilities", () => {
  it("defaults to Asia/Kathmandu", () => {
    expect(DEFAULT_TIMEZONE).toBe("Asia/Kathmandu");
  });

  describe("formatDateOnly and parseDateOnly", () => {
    it("formats ISO string and Date without shift", () => {
      expect(formatDateOnly("2026-11-24T00:00:00.000Z")).toBe("2026-11-24");
      expect(formatDateOnly("2026-11-24")).toBe("2026-11-24");
      const d = new Date(Date.UTC(2026, 10, 24));
      expect(formatDateOnly(d)).toBe("2026-11-24");
    });

    it("parses date-only string to exact UTC midnight", () => {
      const parsed = parseDateOnly("2026-11-24");
      expect(parsed.toISOString()).toBe("2026-11-24T00:00:00.000Z");
      expect(parsed.getUTCFullYear()).toBe(2026);
      expect(parsed.getUTCMonth()).toBe(10); // 0-indexed November
      expect(parsed.getUTCDate()).toBe(24);
      expect(parsed.getUTCHours()).toBe(0);
      expect(parsed.getUTCMinutes()).toBe(0);
    });
  });

  describe("Boundary Cases: India (Asia/Kolkata) vs Nepal (Asia/Kathmandu)", () => {
    // 18:20 UTC on Nov 24, 2026
    // Asia/Kolkata is UTC+5:30 -> Nov 24, 23:50 (Tuesday)
    // Asia/Kathmandu is UTC+5:45 -> Nov 25, 00:05 (Wednesday)
    const boundaryTime = new Date("2026-11-24T18:20:00.000Z");

    it("evaluates different calendar dates across India/Nepal border at 18:20 UTC", () => {
      const todayKolkata = getTodayInTimezone("Asia/Kolkata", boundaryTime);
      const todayKathmandu = getTodayInTimezone("Asia/Kathmandu", boundaryTime);

      expect(todayKolkata).toBe("2026-11-24");
      expect(todayKathmandu).toBe("2026-11-25");
    });

    it("evaluates different days of week across India/Nepal border at 18:20 UTC", () => {
      const dowKolkata = getDayOfWeekInTimezone("Asia/Kolkata", boundaryTime);
      const dowKathmandu = getDayOfWeekInTimezone("Asia/Kathmandu", boundaryTime);

      expect(dowKolkata).toBe("TUE");
      expect(dowKathmandu).toBe("WED");
    });

    it("computes accurate local time components in each timezone", () => {
      const timeKolkata = getTimeInTimezone("Asia/Kolkata", boundaryTime);
      expect(timeKolkata.hour).toBe(23);
      expect(timeKolkata.minute).toBe(50);
      expect(timeKolkata.timeStr).toBe("23:50");

      const timeKathmandu = getTimeInTimezone("Asia/Kathmandu", boundaryTime);
      expect(timeKathmandu.hour).toBe(0);
      expect(timeKathmandu.minute).toBe(5);
      expect(timeKathmandu.timeStr).toBe("00:05");
    });
  });

  describe("getClassTimingStatus", () => {
    const fixedNow = new Date("2026-11-24T08:30:00.000Z"); // 14:00 in Asia/Kolkata

    it("marks past calendar dates as ended", () => {
      const status = getClassTimingStatus({
        date: "2026-11-23",
        startTime: "10:00",
        endTime: "11:00",
        timezone: "Asia/Kolkata",
        now: fixedNow,
      });
      expect(status).toBe("ended");
    });

    it("marks future calendar dates as upcoming", () => {
      const status = getClassTimingStatus({
        date: "2026-11-25",
        startTime: "10:00",
        endTime: "11:00",
        timezone: "Asia/Kolkata",
        now: fixedNow,
      });
      expect(status).toBe("upcoming");
    });

    it("correctly identifies upcoming, in_progress, and ended on the same day", () => {
      // At 14:00 Asia/Kolkata:
      // Class 10:00 - 11:30 is ended
      expect(
        getClassTimingStatus({
          date: "2026-11-24",
          startTime: "10:00",
          endTime: "11:30",
          timezone: "Asia/Kolkata",
          now: fixedNow,
        })
      ).toBe("ended");

      // Class 13:30 - 14:30 is in_progress
      expect(
        getClassTimingStatus({
          date: "2026-11-24",
          startTime: "13:30",
          endTime: "14:30",
          timezone: "Asia/Kolkata",
          now: fixedNow,
        })
      ).toBe("in_progress");

      // Class 15:00 - 16:30 is upcoming
      expect(
        getClassTimingStatus({
          date: "2026-11-24",
          startTime: "15:00",
          endTime: "16:30",
          timezone: "Asia/Kolkata",
          now: fixedNow,
        })
      ).toBe("upcoming");
    });

    it("handles late evening classes correctly", () => {
      // Late evening: 23:00 to 23:50 on Nov 24 in Kolkata
      // Test at 22:45 (17:15 UTC) -> upcoming
      const at2245 = new Date("2026-11-24T17:15:00.000Z");
      expect(
        getClassTimingStatus({
          date: "2026-11-24",
          startTime: "23:00",
          endTime: "23:50",
          timezone: "Asia/Kolkata",
          now: at2245,
        })
      ).toBe("upcoming");

      // Test at 23:20 (17:50 UTC) -> in_progress
      const at2320 = new Date("2026-11-24T17:50:00.000Z");
      expect(
        getClassTimingStatus({
          date: "2026-11-24",
          startTime: "23:00",
          endTime: "23:50",
          timezone: "Asia/Kolkata",
          now: at2320,
        })
      ).toBe("in_progress");

      // Test at 23:55 (18:25 UTC) -> ended
      const at2355 = new Date("2026-11-24T18:25:00.000Z");
      expect(
        getClassTimingStatus({
          date: "2026-11-24",
          startTime: "23:00",
          endTime: "23:50",
          timezone: "Asia/Kolkata",
          now: at2355,
        })
      ).toBe("ended");
    });

    it("handles midnight crossing classes (e.g. 23:30 to 00:30)", () => {
      // Test at 23:45 (18:15 UTC) in Kolkata -> in_progress
      const at2345 = new Date("2026-11-24T18:15:00.000Z");
      expect(
        getClassTimingStatus({
          date: "2026-11-24",
          startTime: "23:30",
          endTime: "00:30",
          timezone: "Asia/Kolkata",
          now: at2345,
        })
      ).toBe("in_progress");
    });

    it("evaluates class status in Asia/Kathmandu accurately across local schedule windows", () => {
      // 09:15 in Kathmandu is 03:30 UTC
      const at0915Kathmandu = new Date("2026-11-24T03:30:00.000Z");

      expect(
        getClassTimingStatus({
          date: "2026-11-24",
          startTime: "09:00",
          endTime: "10:00",
          timezone: "Asia/Kathmandu",
          now: at0915Kathmandu,
        })
      ).toBe("in_progress");

      expect(
        getClassTimingStatus({
          date: "2026-11-24",
          startTime: "10:30",
          endTime: "11:30",
          timezone: "Asia/Kathmandu",
          now: at0915Kathmandu,
        })
      ).toBe("upcoming");
    });

    it("evaluates class status in Asia/Kolkata accurately across local schedule windows", () => {
      // 09:15 in Kolkata is 03:45 UTC
      const at0915Kolkata = new Date("2026-11-24T03:45:00.000Z");

      expect(
        getClassTimingStatus({
          date: "2026-11-24",
          startTime: "09:00",
          endTime: "10:00",
          timezone: "Asia/Kolkata",
          now: at0915Kolkata,
        })
      ).toBe("in_progress");

      expect(
        getClassTimingStatus({
          date: "2026-11-24",
          startTime: "08:00",
          endTime: "09:00",
          timezone: "Asia/Kolkata",
          now: at0915Kolkata,
        })
      ).toBe("ended");
    });
  });
});
