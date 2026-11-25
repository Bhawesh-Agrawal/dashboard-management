import { describe, it, expect } from "vitest";
import { computeWeeklyTopicTrend } from "../analytics";

describe("DSA Weekly Topic Trend Analytics", () => {
  it("buckets attempts into Mon-Sun weeks per topic with independent/attempted counts", () => {
    const trend = computeWeeklyTopicTrend({
      todayStr: "2026-11-25", // Wed of week starting 2026-11-23
      weeksCount: 3,
      topics: [
        { id: "t1", name: "Arrays", order: 1 },
        { id: "t2", name: "Graphs", order: 2 },
      ],
      attempts: [
        { topicId: "t1", attemptDate: "2026-11-23", classification: "independent" },
        { topicId: "t1", attemptDate: "2026-11-25", classification: "hinted" },
        { topicId: "t2", attemptDate: "2026-11-16", classification: "independent" },
        { topicId: "t2", attemptDate: "2026-11-22", classification: "independent" }, // Sun of 2026-11-16 week
      ],
    });

    expect(trend.weekStarts).toEqual(["2026-11-09", "2026-11-16", "2026-11-23"]);
    expect(trend.rows[0].cells).toEqual([
      { weekStart: "2026-11-09", attempted: 0, independent: 0 },
      { weekStart: "2026-11-16", attempted: 0, independent: 0 },
      { weekStart: "2026-11-23", attempted: 2, independent: 1 },
    ]);
    expect(trend.rows[1].cells).toEqual([
      { weekStart: "2026-11-09", attempted: 0, independent: 0 },
      { weekStart: "2026-11-16", attempted: 2, independent: 2 },
      { weekStart: "2026-11-23", attempted: 0, independent: 0 },
    ]);
  });
});
