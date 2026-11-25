import { describe, it, expect } from "vitest";
import {
  buildMorningBriefPayload,
  buildEveningBriefPayload,
} from "../build";

describe("Brief Content Builders (Step 6)", () => {
  it("builds all morning sections, caps task list at 5, and formats a one-line push summary", () => {
    const payload = buildMorningBriefPayload({
      forDate: "2026-11-25",
      hasCurrentSemester: true,
      weatherLine: "18°C, Clear sky (11°–21°)",
      classes: [
        { courseId: "c2", courseName: "OS", startTime: "13:00", endTime: "14:00", location: "Lab B" },
        { courseId: "c1", courseName: "Algorithms", startTime: "09:00", endTime: "10:00", location: "Room 1" },
      ],
      events: [{ id: "e1", title: "Advisor Sync", time: "15:00", date: "2026-11-25", location: "Zoom" }],
      tasks: Array.from({ length: 7 }, (_, i) => ({
        id: `t${i}`,
        title: `Task ${i + 1}`,
        dueDate: "2026-11-25",
        isOverdue: i === 0,
      })),
      travel: [
        {
          eventId: "tr1",
          title: "Flight to Delhi",
          dateTimeLabel: "Nov 26, 08:30",
          location: "TIA",
          documents: [{ noteId: "n1", title: "Boarding Pass", offlineUrl: "/offline-doc/n1" }],
        },
      ],
      dsaSummary: {
        isConfigured: true,
        dueToday: 3,
        overdue: 2,
        topOverdue: ["Two Sum", "LRU Cache"],
      },
      assessments: [
        { id: "a1", title: "Midterm", courseName: "Algorithms", dueDate: "2026-11-27" },
      ],
    });

    expect(payload.kind).toBe("morning");
    expect(payload.weatherLine).toContain("18°C");
    expect(payload.sections.map((s) => s.id)).toEqual([
      "classes",
      "events",
      "tasks",
      "travel",
      "dsa",
      "assessments",
    ]);
    // Time-ordered classes
    expect(payload.sections[0].items[0].label).toBe("Algorithms");
    // Capped tasks at 5 while totalCount is 7
    const taskSec = payload.sections.find((s) => s.id === "tasks")!;
    expect(taskSec.items).toHaveLength(5);
    expect(taskSec.totalCount).toBe(7);
    expect(payload.pushSummary).toContain("2 classes");
    expect(payload.pushSummary).toContain("5 DSA due");
  });

  it("skips empty sections and omits classes when semester is ended", () => {
    const morning = buildMorningBriefPayload({
      forDate: "2026-11-25",
      hasCurrentSemester: false,
      weatherLine: null,
      classes: [{ courseId: "c1", courseName: "Ended Class", startTime: "09:00", endTime: "10:00" }],
      events: [],
      tasks: [],
      travel: [],
      dsaSummary: { isConfigured: false, dueToday: 0, overdue: 0, topOverdue: [] },
      assessments: [],
    });
    expect(morning.sections).toEqual([]);
    expect(morning.weatherLine).toBeNull();
    expect(morning.pushSummary).toContain("Clear schedule");

    const evening = buildEveningBriefPayload({
      forDate: "2026-11-26",
      hasCurrentSemester: false,
      unmarkedTodayCount: 3,
      tomorrowClasses: [{ courseId: "c1", courseName: "Ended Class", startTime: "09:00", endTime: "10:00" }],
      tomorrowEvents: [],
      tasksDueTomorrow: [],
      assessmentsWithin7Days: [],
      travelTomorrow: [],
      tomorrowDsaDueCount: 0,
    });
    expect(evening.sections).toEqual([]);
    expect(evening.earliestCommitment).toBeNull();
  });

  it("builds evening brief with unmarked count, earliest commitment, and tomorrow items", () => {
    const evening = buildEveningBriefPayload({
      forDate: "2026-11-26",
      hasCurrentSemester: true,
      weatherLine: "Tomorrow: 19°C",
      unmarkedTodayCount: 2,
      tomorrowClasses: [
        { courseId: "c1", courseName: "Systems", startTime: "10:30", endTime: "11:30" },
      ],
      tomorrowEvents: [
        { id: "e1", title: "Coffee", time: "08:30", date: "2026-11-26" },
      ],
      tasksDueTomorrow: [{ id: "t1", title: "Read paper", dueDate: "2026-11-26", isOverdue: false }],
      assessmentsWithin7Days: [{ id: "a1", title: "Quiz 2", courseName: "Systems", dueDate: "2026-11-30" }],
      travelTomorrow: [],
      tomorrowDsaDueCount: 4,
    });

    expect(evening.earliestCommitment).toBe("08:30 · Coffee");
    expect(evening.sections.map((s) => s.id)).toEqual([
      "unmarked_attendance",
      "tomorrow_schedule",
      "tasks_tomorrow",
      "assessments_7d",
      "dsa_tomorrow",
    ]);
    expect(evening.pushSummary).toContain("First up 08:30 · Coffee");
    expect(evening.pushSummary).toContain("2 unmarked today");
  });
});
