import { describe, expect, it } from "vitest";
import { auditCalendarEntries, type AuditableCalendarEntry } from "../calendar-audit";

describe("auditCalendarEntries", () => {
  it("flags long cancelling ranges, past semester end, title starting with date, and single-day date mismatch", () => {
    const entries: AuditableCalendarEntry[] = [
      {
        id: "a1",
        kind: "exam_period",
        title: "8 Apr 2027: End-Semester Examinations (exam period)",
        startDate: "2027-04-01",
        endDate: "2027-08-01",
        cancelsClasses: true,
        followsWeekday: null,
      },
      {
        id: "a2",
        kind: "no_classes",
        title: "14 Feb 2027: CURA (no classes)",
        startDate: "2027-02-13",
        endDate: "2027-02-13",
        cancelsClasses: true,
        followsWeekday: null,
      },
      {
        id: "a3",
        kind: "holiday",
        title: "Republic Day",
        startDate: "2027-01-26",
        endDate: "2027-01-26",
        cancelsClasses: true,
        followsWeekday: null,
      },
    ];

    const findings = auditCalendarEntries(entries, {
      semesterEndDate: "2027-04-10",
    });

    expect(findings).toHaveLength(2);
    expect(findings[0].issues.map((i) => i.code)).toEqual([
      "long_cancelling_range",
      "past_semester_end",
      "title_starts_with_date",
    ]);
    expect(findings[0].suggestedTitle).toBe("End-Semester Examinations");
    expect(findings[0].suggestedEndDate).toBe("2027-04-10");

    expect(findings[1].issues.map((i) => i.code)).toEqual([
      "title_starts_with_date",
      "single_day_title_mentions_other_date",
    ]);
    expect(findings[1].suggestedEndDate).toBe("2027-02-14");
    expect(findings[1].suggestedTitle).toBe("CURA");
  });
});
