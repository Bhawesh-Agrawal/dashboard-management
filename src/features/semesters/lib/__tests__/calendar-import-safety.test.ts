import { describe, expect, it } from "vitest";
import type { ParsedCalendarEntry } from "../calendar-import";
import {
  countCancelledWeekdays,
  evaluateImportRows,
} from "../calendar-import-safety";

describe("calendar-import-safety", () => {
  it("flags long cancelling ranges, past semester end, outside range, end<start, and duplicates", () => {
    const rows: ParsedCalendarEntry[] = [
      {
        id: "r1",
        kind: "holiday",
        title: "Long Break",
        startDate: "2027-01-01",
        endDate: "2027-01-30",
        cancelsClasses: true,
        followsWeekday: null,
      },
      {
        id: "r2",
        kind: "exam_period",
        title: "End Sem",
        startDate: "2027-04-05",
        endDate: "2027-04-15",
        cancelsClasses: true,
        followsWeekday: null,
      },
      {
        id: "r3",
        kind: "note",
        title: "Summer Internship",
        startDate: "2027-05-01",
        endDate: "2027-06-01",
        cancelsClasses: false,
        followsWeekday: null,
      },
      {
        id: "r4",
        kind: "holiday",
        title: "Reversed",
        startDate: "2027-02-10",
        endDate: "2027-02-05",
        cancelsClasses: true,
        followsWeekday: null,
      },
      {
        id: "r5",
        kind: "holiday",
        title: "Republic Day",
        startDate: "2027-01-26",
        endDate: "2027-01-26",
        cancelsClasses: true,
        followsWeekday: null,
      },
    ];

    const res = evaluateImportRows(rows, {
      semesterStartDate: "2026-12-18",
      semesterEndDate: "2027-04-10",
      existingEntries: [
        {
          startDate: "2027-01-26",
          endDate: "2027-01-26",
          title: "Republic Day",
        },
      ],
    });

    expect(res.flagsByRowId["r1"].map((f) => f.code)).toContain(
      "long_cancelling_range"
    );
    expect(res.flagsByRowId["r2"].map((f) => f.code)).toContain(
      "extends_past_semester_end"
    );
    expect(res.flagsByRowId["r3"].map((f) => f.code)).toContain(
      "outside_semester_range"
    );
    expect(res.defaultExcludedIds.has("r3")).toBe(true);
    expect(res.flagsByRowId["r4"].map((f) => f.code)).toContain("end_before_start");
    expect(res.flagsByRowId["r5"].map((f) => f.code)).toContain(
      "duplicate_existing"
    );
  });

  it("counts distinct cancelled weekdays", () => {
    // 2027-01-28 (Thu) .. 2027-02-04 (Thu) = 6 weekdays (Thu, Fri, Mon, Tue, Wed, Thu)
    const count = countCancelledWeekdays([
      { startDate: "2027-01-28", endDate: "2027-02-04", cancelsClasses: true },
      { startDate: "2027-01-30", endDate: "2027-01-31", cancelsClasses: true }, // Sat-Sun overlap
      { startDate: "2027-02-10", endDate: "2027-02-12", cancelsClasses: false },
    ]);
    expect(count).toBe(6);
  });
});
