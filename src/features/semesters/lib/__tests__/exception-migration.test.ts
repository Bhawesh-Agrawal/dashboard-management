import { describe, expect, it } from "vitest";
import { detectRepeatedCancelledDates } from "../exception-migration";

describe("detectRepeatedCancelledDates", () => {
  it("proposes a holiday when every class on that weekday is cancelled", () => {
    const candidates = detectRepeatedCancelledDates([
      {
        id: "s1",
        dayOfWeek: "MON",
        exceptions: [
          { id: "e1", date: "2026-09-07", type: "cancelled", reason: "Labor Day" },
        ],
      },
      {
        id: "s2",
        dayOfWeek: "MON",
        exceptions: [
          { id: "e2", date: "2026-09-07", type: "cancelled", reason: "Labor Day" },
        ],
      },
    ]);

    expect(candidates).toEqual([
      {
        date: "2026-09-07",
        title: "Labor Day",
        exceptionIds: ["e1", "e2"],
        scheduleCount: 2,
      },
    ]);
  });

  it("skips dates where only a subset of classes on that weekday are cancelled", () => {
    const candidates = detectRepeatedCancelledDates([
      {
        id: "s1",
        dayOfWeek: "MON",
        exceptions: [
          { id: "e1", date: "2026-09-14", type: "cancelled", reason: "Prof away" },
        ],
      },
      {
        id: "s2",
        dayOfWeek: "MON",
        exceptions: [],
      },
    ]);

    expect(candidates).toEqual([]);
  });

  it("ignores dates whose weekday has no scheduled classes", () => {
    const candidates = detectRepeatedCancelledDates([
      {
        id: "s1",
        dayOfWeek: "MON",
        exceptions: [
          { id: "e1", date: "2026-09-08", type: "cancelled", reason: "Tuesday?" },
        ],
      },
    ]);

    expect(candidates).toEqual([]);
  });
});
