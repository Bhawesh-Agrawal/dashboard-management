import { describe, it, expect } from "vitest";
import { semesterStatus } from "../status";
import { getTodayInTimezone } from "@/lib/timezone";

describe("semesterStatus (A1)", () => {
  const semester = {
    startDate: new Date("2026-08-01T00:00:00.000Z"),
    endDate: new Date("2026-11-20T00:00:00.000Z"),
  };

  it("returns upcoming on the day before startDate", () => {
    expect(semesterStatus(semester, "2026-07-31")).toBe("upcoming");
  });

  it("returns active on startDate (inclusive)", () => {
    expect(semesterStatus(semester, "2026-08-01")).toBe("active");
  });

  it("returns active on endDate (inclusive, even when stored at midnight UTC)", () => {
    expect(semesterStatus(semester, "2026-11-20")).toBe("active");
  });

  it("returns ended on the day after endDate", () => {
    expect(semesterStatus(semester, "2026-11-21")).toBe("ended");
  });

  it("handles timezone day boundaries accurately in Asia/Kathmandu (+05:45)", () => {
    // 2026-11-20T18:14:00Z is 2026-11-20 23:59 in Asia/Kathmandu -> still active on Nov 20
    const beforeMidnightNpt = getTodayInTimezone(
      "Asia/Kathmandu",
      new Date("2026-11-20T18:14:00.000Z")
    );
    expect(beforeMidnightNpt).toBe("2026-11-20");
    expect(semesterStatus(semester, beforeMidnightNpt)).toBe("active");

    // 2026-11-20T18:15:00Z is 2026-11-21 00:00 in Asia/Kathmandu -> ended on Nov 21
    const afterMidnightNpt = getTodayInTimezone(
      "Asia/Kathmandu",
      new Date("2026-11-20T18:15:00.000Z")
    );
    expect(afterMidnightNpt).toBe("2026-11-21");
    expect(semesterStatus(semester, afterMidnightNpt)).toBe("ended");
  });

  it("normalizes non-midnight endDate DateTime values to date-only", () => {
    const nonMidnightEnd = {
      startDate: new Date("2026-08-01T14:30:00.000Z"),
      endDate: new Date("2026-11-20T23:59:59.999Z"),
    };
    expect(semesterStatus(nonMidnightEnd, "2026-11-20")).toBe("active");
    expect(semesterStatus(nonMidnightEnd, "2026-11-21")).toBe("ended");
  });
});
