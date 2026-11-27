import { describe, expect, it } from "vitest";
import { buildNudgesSection } from "../sections";

describe("upcoming & scheduleless semester nudges", () => {
  it("emits no_timetable nudge when an upcoming semester has no timetable", () => {
    const nudges = buildNudgesSection({
      hasCurrentSemester: false,
      upcomingSemester: {
        id: "sem-next",
        name: "Spring 2027",
        daysUntilStart: 12,
        hasTimetable: false,
      },
      hasPushSubscription: true,
      hasCitySet: true,
      googleCalendarConnected: true,
      dsaBankCount: 10,
    });

    expect(nudges).toHaveLength(1);
    expect(nudges[0]).toMatchObject({
      kind: "no_timetable",
      href: "/semesters/sem-next/timetable",
    });
    expect(nudges[0].message).toContain("12 days");
  });

  it("emits no_timetable nudge when current semester has no schedule", () => {
    const nudges = buildNudgesSection({
      hasCurrentSemester: true,
      hasTimetable: false,
      hasPushSubscription: true,
      hasCitySet: true,
      googleCalendarConnected: true,
      dsaBankCount: 10,
    });

    expect(nudges).toHaveLength(1);
    expect(nudges[0].kind).toBe("no_timetable");
  });

  it("stays silent about no_timetable once timetable exists", () => {
    const nudges = buildNudgesSection({
      hasCurrentSemester: true,
      hasTimetable: true,
      hasPushSubscription: true,
      hasCitySet: true,
      googleCalendarConnected: true,
      dsaBankCount: 10,
    });

    expect(nudges.some((n) => n.kind === "no_timetable")).toBe(false);
  });
});
