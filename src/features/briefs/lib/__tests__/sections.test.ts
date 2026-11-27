import { describe, expect, it } from "vitest";
import {
  buildBriefPayloadV2,
  buildDeadlinesSection,
  buildNextUpSection,
  buildNudgesSection,
  buildTimelineSection,
} from "../sections";

describe("Brief v2 pure section builders", () => {
  it("merges classes, local events, and Google Calendar events and labels 60+ min gaps", () => {
    const timeline = buildTimelineSection({
      kind: "morning",
      nowHm: "07:30",
      hasCurrentSemester: true,
      classes: [
        {
          courseId: "c1",
          courseName: "Algorithms",
          startTime: "09:00",
          endTime: "10:00",
          location: "LH-1",
        },
      ],
      events: [
        {
          id: "e1",
          title: "Project Sync",
          time: "12:00",
          date: "2026-11-27",
          location: "Lab 2",
        },
      ],
      googleEvents: [
        {
          id: "g1",
          title: "Dentist",
          time: "14:00",
          endTime: "14:30",
          date: "2026-11-27",
          calendarName: "Personal",
        },
        {
          id: "g-allday",
          title: "Holiday",
          date: "2026-11-27",
        },
      ],
    });

    expect(timeline.map((t) => t.kind)).toEqual([
      "class",
      "gap",
      "event",
      "gap",
      "google_event",
    ]);
    expect(timeline[1].title).toBe("2h free gap");
    expect(timeline[3].title).toBe("2h free gap");
  });

  it("filters midday timeline to remaining items and computes nextUp within 12h", () => {
    const timeline = buildTimelineSection({
      kind: "midday",
      nowHm: "12:30",
      hasCurrentSemester: true,
      classes: [
        { courseId: "c1", courseName: "Morning Class", startTime: "09:00", endTime: "10:00" },
        { courseId: "c2", courseName: "Afternoon Lab", startTime: "14:00", endTime: "16:00" },
      ],
      events: [],
    });

    expect(timeline).toHaveLength(1);
    expect(timeline[0].title).toBe("Afternoon Lab");

    const nextUp = buildNextUpSection({
      kind: "midday",
      nowHm: "12:30",
      timeline,
      tasksToday: [],
    });
    expect(nextUp?.title).toBe("Afternoon Lab");
    expect(nextUp?.minutesRemaining).toBe(90);
  });

  it("caps overdue tasks at 5 while preserving totalCount", () => {
    const overdue = Array.from({ length: 7 }, (_, i) => ({
      id: `t-${i}`,
      title: `Task ${i}`,
      dueDate: "2026-11-20",
      isOverdue: true,
    }));

    const deadlines = buildDeadlinesSection({
      tasksToday: [],
      overdueTasks: overdue,
      tasksWithin3Days: [],
      assessmentsWithin7Days: [],
    });

    expect(deadlines?.overdueTasks).toHaveLength(5);
    expect(deadlines?.overdueTotalCount).toBe(7);
  });

  it("generates setup nudges once per day and includes semester-ended date", () => {
    const nudges = buildNudgesSection({
      hasCurrentSemester: false,
      lastEndedSemester: { name: "Semester 3", endDate: "2026-11-15" },
      hasPushSubscription: false,
      hasCitySet: false,
      googleCalendarConnected: false,
      dsaBankCount: 0,
      alreadyShownToday: new Set(["no_city"]),
    });

    expect(nudges.some((n) => n.message.includes("Semester 3 ended on 2026-11-15"))).toBe(true);
    expect(nudges.some((n) => n.kind === "no_city")).toBe(false);
  });

  it("handles empty days plainly while surfacing study, deadlines, and notes", () => {
    const payload = buildBriefPayloadV2({
      kind: "morning",
      forDate: "2026-11-27",
      nowHm: "07:30",
      generatedAt: "2026-11-27T07:30:00.000Z",
      hasCurrentSemester: false,
      classes: [],
      events: [],
      tasksToday: [{ id: "t1", title: "Submit report", dueDate: "2026-11-27", isOverdue: false }],
      overdueTasks: [],
      tasksWithin3Days: [],
      assessmentsWithin7Days: [],
      travel: [],
      dsaSummary: {
        isConfigured: true,
        dueToday: 2,
        overdue: 1,
        topOverdue: ["Two Sum"],
      },
      programmeDay: 14,
      attemptsLast7Days: 9,
      recentNotes: [
        { id: "n1", title: "DP Notes", updatedAt: "2026-11-26", href: "/notes/n1" },
      ],
    });

    expect(payload.isEmptyDay).toBe(true);
    expect(payload.headline?.text).toBe("Clear schedule today");
    expect(payload.deadlines?.tasksToday).toHaveLength(1);
    expect(payload.study?.programmeDay).toBe(14);
    expect(payload.study?.attemptsLast7Days).toBe(9);
    expect(payload.notes).toHaveLength(1);
  });
});
