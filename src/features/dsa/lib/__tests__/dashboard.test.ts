import { describe, it, expect } from "vitest";
import { computeDsaDashboard } from "../dashboard";

describe("DSA Dashboard Computation", () => {
  it("computes programme day, phase, 5 dashboard questions, and >7d backup banner", () => {
    const now = new Date("2026-11-25T10:00:00.000Z");
    const data = computeDsaDashboard({
      now,
      todayStr: "2026-11-25",
      settings: {
        programmeStartDate: "2026-11-01", // Day 25
        programmeLengthDays: 90,
        phases: [
          { name: "Foundations", startDay: 1 },
          { name: "Core Patterns", startDay: 20 },
          { name: "Graphs & DP", startDay: 50 },
        ],
        currentTopicId: "t1",
        lastBackupAt: new Date("2026-11-10T10:00:00.000Z"), // 15 days old -> banner true
      },
      topics: [
        { id: "t1", name: "Arrays", order: 1, status: "in_progress" },
        { id: "t2", name: "DP", order: 2, status: "practised" },
        { id: "t3", name: "Graphs", order: 3, status: "not_started" },
      ],
      problems: [
        {
          id: "p1",
          topicId: "t1",
          topicName: "Arrays",
          subtopic: "",
          title: "P1",
          difficulty: "easy",
          sourceUrl: "",
          orderInTopic: 1,
          archived: false,
          lastClassification: "editorial",
          nextRevisionDate: "2026-11-24", // overdue
          manualNextRevisionDate: null,
          attempts: [{ classification: "editorial" }],
        },
        {
          id: "p2",
          topicId: "t1",
          topicName: "Arrays",
          subtopic: "",
          title: "P2",
          difficulty: "easy",
          sourceUrl: "",
          orderInTopic: 2,
          archived: false,
          lastClassification: null,
          nextRevisionDate: null,
          manualNextRevisionDate: null,
          attempts: [],
        },
        {
          id: "p3",
          topicId: "t1",
          topicName: "Arrays",
          subtopic: "",
          title: "P3",
          difficulty: "medium",
          sourceUrl: "",
          orderInTopic: 3,
          archived: false,
          lastClassification: null,
          nextRevisionDate: null,
          manualNextRevisionDate: null,
          attempts: [],
        },
        {
          id: "p4",
          topicId: "t1",
          topicName: "Arrays",
          subtopic: "",
          title: "P4",
          difficulty: "medium",
          sourceUrl: "",
          orderInTopic: 4,
          archived: false,
          lastClassification: null,
          nextRevisionDate: null,
          manualNextRevisionDate: null,
          attempts: [],
        },
        {
          id: "p5",
          topicId: "t1",
          topicName: "Arrays",
          subtopic: "",
          title: "P5",
          difficulty: "hard",
          sourceUrl: "",
          orderInTopic: 5,
          archived: false,
          lastClassification: null,
          nextRevisionDate: null,
          manualNextRevisionDate: null,
          attempts: [],
        },
        {
          id: "p6",
          topicId: "t2",
          topicName: "DP",
          subtopic: "",
          title: "P6",
          difficulty: "medium",
          sourceUrl: "",
          orderInTopic: 1,
          archived: false,
          lastClassification: "independent",
          nextRevisionDate: "2026-11-25", // due today
          manualNextRevisionDate: null,
          attempts: [
            { classification: "editorial" },
            { classification: "not_understood" },
            { classification: "independent" },
          ], // failureCount == 2 -> struggling despite latest independent
        },
      ],
      sessions: [
        { date: "2026-11-25", hasActivity: true }, // Wed this week (2026-11-23 is Mon)
        { date: "2026-11-23", hasActivity: true }, // Mon this week
        { date: "2026-11-18", hasActivity: true }, // Last week
      ],
      recentAttempts: [],
    });

    expect(data.isFirstRun).toBe(false);
    expect(data.programmeDay).toBe(25);
    expect(data.currentPhase).toBe("Core Patterns");
    expect(data.needsBackupBanner).toBe(true);
    expect(data.studyToday.nextProblems.map((p) => p.id)).toEqual(["p2", "p3", "p4"]);
    expect(data.studyToday.overdueCount).toBe(1);
    expect(data.studyToday.dueTodayCount).toBe(1);
    expect(data.topicsSummary).toMatchObject({
      covered: 1,
      inProgress: 1,
      remaining: 1,
    });
    expect(data.struggling.problems.map((p) => p.id)).toEqual(["p6", "p1"]);
    expect(data.consistency.sessionsThisWeek).toBe(2);
    expect(data.consistency.daysSinceLastSession).toBe(0);
    expect(data.consistency.last4Weeks[3].count).toBe(1);
  });
});
