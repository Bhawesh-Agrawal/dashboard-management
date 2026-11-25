import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  buildTutorReportData,
  formatTutorReportJson,
  formatTutorReportMarkdown,
  isReportOverSizeThreshold,
  TUTOR_REPORT_SCHEMA_VERSION,
  type TutorReportSourceInput,
} from "../report";

const TutorReportJsonSchema = z.object({
  schemaVersion: z.literal(TUTOR_REPORT_SCHEMA_VERSION),
  snapshot: z.object({
    generatedAt: z.string(),
    programmeDay: z.number().int(),
    programmeLengthDays: z.number().int(),
    currentPhase: z.string().nullable(),
    currentTopic: z.string().nullable(),
    timezone: z.string(),
  }),
  legend: z.array(z.unknown()).length(5),
  topics: z.array(z.unknown()),
  currentTopicProblems: z.array(z.unknown()),
  revision: z.object({
    overdue: z.array(z.unknown()),
    dueToday: z.array(z.unknown()),
    next7Days: z.array(z.unknown()),
  }),
  recentSessions: z.array(z.unknown()),
  attemptHistory: z.array(z.unknown()),
  recurringMistakes: z.object({
    overall: z.array(z.unknown()),
    byTopic: z.array(z.unknown()),
  }),
  weakConcepts: z.object({
    topicsByFailureRatio: z.array(z.unknown()),
    subtopicsByFailureRatio: z.array(z.unknown()),
    repeatedFailureProblems: z.array(z.unknown()),
    lowConfidenceProblems: z.array(z.unknown()),
  }),
  contests: z.array(z.unknown()),
  availability: z.object({
    nextSessionMinutes: z.number().nullable(),
    tutorNote: z.string().nullable(),
  }),
});

const SAMPLE_SOURCE: TutorReportSourceInput = {
  generatedAtIso: "2026-11-25T10:00:00.000Z",
  todayStr: "2026-11-25",
  timezone: "Asia/Kathmandu",
  settings: {
    programmeStartDate: "2026-11-01",
    programmeLengthDays: 90,
    phases: [{ name: "Phase 1: Basics", startDay: 1 }],
    currentTopicId: "t-1",
  },
  topics: [{ id: "t-1", name: "Arrays", order: 1, status: "in_progress" }],
  problems: [
    {
      id: "p-1",
      topicId: "t-1",
      topicName: "Arrays",
      subtopic: "Hashing",
      title: "Two Sum",
      difficulty: "easy",
      archived: false,
      lastClassification: "independent",
      intervalDays: 7,
      consecutiveIndependent: 1,
      nextRevisionDate: "2026-11-25",
      manualNextRevisionDate: null,
      attempts: [
        {
          id: "a-1",
          attemptedAt: "2026-11-18T10:00:00.000Z",
          attemptDate: "2026-11-18",
          classification: "editorial",
          timeSpentMin: 40,
          confidence: 2,
          isRevision: false,
          helpType: "editorial",
          initialApproach: "Brute force O(n^2)",
          finalApproach: "Hash map single pass",
          mistakes: "Missed duplicate index check",
          mistakeTags: ["edge case"],
          timeComplexity: "O(n)",
          spaceComplexity: "O(n)",
          observation: "Check i !== map[target - x]",
        },
        {
          id: "a-2",
          attemptedAt: "2026-11-24T10:00:00.000Z",
          attemptDate: "2026-11-24",
          classification: "independent",
          timeSpentMin: 15,
          confidence: 5,
          isRevision: true,
          helpType: "none",
          initialApproach: null,
          finalApproach: null,
          mistakes: null,
          mistakeTags: [],
          timeComplexity: null,
          spaceComplexity: null,
          observation: "Clean solve",
        },
      ],
    },
  ],
  sessions: [
    {
      date: "2026-11-24",
      durationMin: 45,
      observations: "Solid review",
      nextSessionAvailabilityMin: 60,
      nextSessionNote: "Morning slot",
      attempts: [{ classification: "independent", topicName: "Arrays" }],
    },
  ],
  contests: [
    {
      platform: "leetcode",
      name: "Weekly 420",
      date: "2026-11-24",
      problemsAttempted: 3,
      problemsSolved: 2,
      rankOrRating: "1650",
      upsolveProblems: "Q3",
      conceptsMissed: "Sliding window",
    },
  ],
};

describe("DSA Tutor Report", () => {
  it("generates structured JSON matching schemaVersion and zero personal fields", () => {
    const data = buildTutorReportData(SAMPLE_SOURCE, {
      windowDays: 14,
      includeFullHistory: true,
      nextSessionMinutes: 60,
      tutorNote: "Focus on graphs next",
    });

    const jsonStr = formatTutorReportJson(data);
    const parsed = JSON.parse(jsonStr);
    expect(() => TutorReportJsonSchema.parse(parsed)).not.toThrow();

    // Ensure no personal identifiers leak into output
    expect(jsonStr).not.toContain("userId");
    expect(jsonStr).not.toContain("email");
    expect(jsonStr).not.toContain("@");
  });

  it("renders Markdown with all 11 sections in order and supports latest-state-only toggle", () => {
    const fullData = buildTutorReportData(SAMPLE_SOURCE, {
      windowDays: 14,
      includeFullHistory: true,
      nextSessionMinutes: 60,
      tutorNote: "Focus on graphs next",
    });
    const md = formatTutorReportMarkdown(fullData);

    expect(md).toMatchSnapshot();
    expect(md).toContain("## 1. Snapshot");
    expect(md).toContain("## 2. Classification & Revision Legend");
    expect(md).toContain("## 3. Topics Overview");
    expect(md).toContain("## 4. Current Topic Problems");
    expect(md).toContain("## 5. Revision Queue");
    expect(md).toContain("## 6. Recent Sessions");
    expect(md).toContain("## 7. Attempt History");
    expect(md).toContain("## 8. Recurring Mistakes");
    expect(md).toContain("## 9. Weak Concepts");
    expect(md).toContain("## 10. Recent Contests");
    expect(md).toContain("## 11. Availability & Note for Tutor");

    const latestOnly = buildTutorReportData(SAMPLE_SOURCE, {
      windowDays: 14,
      includeFullHistory: false,
      nextSessionMinutes: 45,
      tutorNote: "",
    });
    expect(latestOnly.attemptHistory[0].attempts).toHaveLength(1);
    expect(latestOnly.attemptHistory[0].attempts[0].date).toBe("2026-11-24");
  });

  it("flags size warning above 30,000 characters", () => {
    expect(isReportOverSizeThreshold("a".repeat(30_000))).toBe(false);
    expect(isReportOverSizeThreshold("a".repeat(30_001))).toBe(true);
  });
});
