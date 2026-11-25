import { describe, it, expect } from "vitest";
import {
  recomputeProblemState,
  computeFailureCount,
  getEffectiveRevisionDate,
  buildRevisionQueue,
  type RevisionQueueInputProblem,
} from "../revision";
import { dsaToday, DSA_DEFAULT_TIMEZONE } from "../time";
import type { DsaClassificationValue } from "../schemas";

describe("DSA Revision Engine (pure)", () => {
  it("returns empty state when attempt history is empty", () => {
    expect(recomputeProblemState([])).toEqual({
      lastClassification: null,
      lastAttemptAt: null,
      intervalDays: null,
      consecutiveIndependent: 0,
      nextRevisionDate: null,
    });
  });

  it.each<{
    name: string;
    attempts: Array<{ date: string; classification: DsaClassificationValue }>;
    expectedInterval: number;
    expectedConsecutive: number;
    expectedNextDate: string;
  }>([
    {
      name: "first independent -> 7 days",
      attempts: [{ date: "2026-11-01", classification: "independent" }],
      expectedInterval: 7,
      expectedConsecutive: 1,
      expectedNextDate: "2026-11-08",
    },
    {
      name: "second consecutive independent -> 14 days",
      attempts: [
        { date: "2026-11-01", classification: "independent" },
        { date: "2026-11-08", classification: "independent" },
      ],
      expectedInterval: 14,
      expectedConsecutive: 2,
      expectedNextDate: "2026-11-22",
    },
    {
      name: "third consecutive independent -> 30 days",
      attempts: [
        { date: "2026-11-01", classification: "independent" },
        { date: "2026-11-08", classification: "independent" },
        { date: "2026-11-22", classification: "independent" },
      ],
      expectedInterval: 30,
      expectedConsecutive: 3,
      expectedNextDate: "2026-12-22",
    },
    {
      name: "fourth consecutive independent stays capped at 30 days",
      attempts: [
        { date: "2026-10-01", classification: "independent" },
        { date: "2026-10-08", classification: "independent" },
        { date: "2026-10-22", classification: "independent" },
        { date: "2026-11-21", classification: "independent" },
      ],
      expectedInterval: 30,
      expectedConsecutive: 4,
      expectedNextDate: "2026-12-21",
    },
    {
      name: "effortful -> 3 days and resets consecutiveIndependent",
      attempts: [
        { date: "2026-11-01", classification: "independent" },
        { date: "2026-11-08", classification: "effortful" },
      ],
      expectedInterval: 3,
      expectedConsecutive: 0,
      expectedNextDate: "2026-11-11",
    },
    {
      name: "hinted -> 2 days and resets consecutiveIndependent",
      attempts: [
        { date: "2026-11-01", classification: "independent" },
        { date: "2026-11-08", classification: "hinted" },
      ],
      expectedInterval: 2,
      expectedConsecutive: 0,
      expectedNextDate: "2026-11-10",
    },
    {
      name: "editorial -> 1 day and resets consecutiveIndependent",
      attempts: [
        { date: "2026-11-01", classification: "independent" },
        { date: "2026-11-08", classification: "independent" },
        { date: "2026-11-22", classification: "independent" },
        { date: "2026-12-22", classification: "editorial" },
      ],
      expectedInterval: 1,
      expectedConsecutive: 0,
      expectedNextDate: "2026-12-23",
    },
    {
      name: "not_understood -> 1 day and resets streak before restarting at 7 days",
      attempts: [
        { date: "2026-11-01", classification: "independent" },
        { date: "2026-11-08", classification: "independent" },
        { date: "2026-11-22", classification: "not_understood" },
        { date: "2026-11-23", classification: "independent" },
      ],
      expectedInterval: 7,
      expectedConsecutive: 1,
      expectedNextDate: "2026-11-30",
    },
  ])("$name", ({ attempts, expectedInterval, expectedConsecutive, expectedNextDate }) => {
    const input = attempts.map((a, idx) => ({
      attemptedAt: new Date(`${a.date}T10:0${idx}:00.000Z`),
      attemptDate: a.date,
      classification: a.classification,
    }));
    const state = recomputeProblemState(input);
    expect(state.intervalDays).toBe(expectedInterval);
    expect(state.consecutiveIndependent).toBe(expectedConsecutive);
    expect(state.nextRevisionDate).toBe(expectedNextDate);
    expect(state.lastClassification).toBe(attempts[attempts.length - 1].classification);
  });

  it("replays backdated, edited, and deleted attempts strictly in attemptedAt order", () => {
    // Log Nov 10 independent first, then backdate Nov 01 independent
    const withBackdated = recomputeProblemState([
      {
        attemptedAt: new Date("2026-11-10T10:00:00.000Z"),
        attemptDate: "2026-11-10",
        classification: "independent",
      },
      {
        attemptedAt: new Date("2026-11-01T10:00:00.000Z"),
        attemptDate: "2026-11-01",
        classification: "independent",
      },
    ]);
    expect(withBackdated.consecutiveIndependent).toBe(2);
    expect(withBackdated.intervalDays).toBe(14);
    expect(withBackdated.nextRevisionDate).toBe("2026-11-24");

    // Simulate editing Nov 10 from independent -> hinted
    const afterEdit = recomputeProblemState([
      {
        attemptedAt: new Date("2026-11-01T10:00:00.000Z"),
        attemptDate: "2026-11-01",
        classification: "independent",
      },
      {
        attemptedAt: new Date("2026-11-10T10:00:00.000Z"),
        attemptDate: "2026-11-10",
        classification: "hinted",
      },
    ]);
    expect(afterEdit.consecutiveIndependent).toBe(0);
    expect(afterEdit.intervalDays).toBe(2);
    expect(afterEdit.nextRevisionDate).toBe("2026-11-12");

    // Simulate deleting Nov 10 attempt -> reverts cleanly to Nov 01 state
    const afterDelete = recomputeProblemState([
      {
        attemptedAt: new Date("2026-11-01T10:00:00.000Z"),
        attemptDate: "2026-11-01",
        classification: "independent",
      },
    ]);
    expect(afterDelete.consecutiveIndependent).toBe(1);
    expect(afterDelete.intervalDays).toBe(7);
    expect(afterDelete.nextRevisionDate).toBe("2026-11-08");
  });

  it("derives failureCount from editorial and not_understood attempts only", () => {
    expect(
      computeFailureCount([
        { classification: "independent" },
        { classification: "effortful" },
        { classification: "hinted" },
        { classification: "editorial" },
        { classification: "not_understood" },
        { classification: "editorial" },
      ])
    ).toBe(3);
  });

  it("prefers manualNextRevisionDate over nextRevisionDate when present", () => {
    expect(
      getEffectiveRevisionDate({
        nextRevisionDate: "2026-11-27",
        manualNextRevisionDate: "2026-12-05",
      })
    ).toBe("2026-12-05");
    expect(
      getEffectiveRevisionDate({
        nextRevisionDate: "2026-11-27",
        manualNextRevisionDate: null,
      })
    ).toBe("2026-11-27");
  });

  it("builds revision queue sections and sorts Overdue/Due today by failureCount desc, daysOverdue desc, severity desc", () => {
    const todayStr = "2026-11-25";
    const makeProblem = (
      overrides: Partial<RevisionQueueInputProblem> & { id: string; title: string }
    ): RevisionQueueInputProblem => ({
      topicId: "t-1",
      topicName: "Arrays",
      subtopic: "",
      difficulty: "medium",
      sourceUrl: "",
      archived: false,
      lastClassification: "hinted",
      intervalDays: 2,
      consecutiveIndependent: 0,
      nextRevisionDate: "2026-11-25",
      manualNextRevisionDate: null,
      attempts: [],
      ...overrides,
    });

    const queue = buildRevisionQueue(
      [
        // Overdue: 2 failures, 2 days overdue
        makeProblem({
          id: "ov-high-fail",
          title: "OV High Fail",
          nextRevisionDate: "2026-11-23",
          lastClassification: "hinted",
          attempts: [
            { attemptDate: "2026-11-10", classification: "editorial", isRevision: false },
            { attemptDate: "2026-11-12", classification: "not_understood", isRevision: true },
          ],
        }),
        // Overdue: 1 failure, 5 days overdue (should come AFTER 2 failures)
        makeProblem({
          id: "ov-more-days",
          title: "OV More Days",
          nextRevisionDate: "2026-11-20",
          lastClassification: "not_understood",
          attempts: [
            { attemptDate: "2026-11-19", classification: "not_understood", isRevision: false },
          ],
        }),
        // Overdue: 1 failure, 2 days overdue, severity not_understood vs editorial
        makeProblem({
          id: "ov-sev-ed",
          title: "OV Sev Editorial",
          nextRevisionDate: "2026-11-23",
          lastClassification: "editorial",
          attempts: [
            { attemptDate: "2026-11-22", classification: "editorial", isRevision: false },
          ],
        }),
        makeProblem({
          id: "ov-sev-nu",
          title: "OV Sev Not Understood",
          nextRevisionDate: "2026-11-23",
          lastClassification: "not_understood",
          attempts: [
            { attemptDate: "2026-11-22", classification: "not_understood", isRevision: false },
          ],
        }),
        // Due today
        makeProblem({
          id: "due-today",
          title: "Due Today Item",
          nextRevisionDate: "2026-11-25",
          lastClassification: "effortful",
          attempts: [
            { attemptDate: "2026-11-22", classification: "effortful", isRevision: false },
          ],
        }),
        // Next 7 days + recently revised
        makeProblem({
          id: "next-7",
          title: "Next 7 Item",
          nextRevisionDate: "2026-11-29",
          lastClassification: "independent",
          attempts: [
            { attemptDate: "2026-11-15", classification: "hinted", isRevision: false },
            { attemptDate: "2026-11-22", classification: "independent", isRevision: true },
          ],
        }),
        // Archived (excluded)
        makeProblem({
          id: "arch",
          title: "Archived",
          archived: true,
          nextRevisionDate: "2026-11-01",
        }),
      ],
      todayStr
    );

    expect(queue.overdue.map((i) => i.id)).toEqual([
      "ov-high-fail",
      "ov-more-days",
      "ov-sev-nu",
      "ov-sev-ed",
    ]);
    expect(queue.dueToday.map((i) => i.id)).toEqual(["due-today"]);
    expect(queue.next7Days.map((i) => i.id)).toEqual(["next-7"]);
    expect(queue.recentlyRevised.map((i) => i.id)).toEqual(["next-7"]);
  });

  it("handles Asia/Kathmandu (+05:45) timezone day boundaries accurately", () => {
    expect(DSA_DEFAULT_TIMEZONE).toBe("Asia/Kathmandu");
    // 2026-11-25 18:14 UTC is 23:59 NPT (still Nov 25)
    expect(dsaToday(new Date("2026-11-25T18:14:00.000Z"))).toBe("2026-11-25");
    // 2026-11-25 18:15 UTC is 00:00 NPT on Nov 26
    expect(dsaToday(new Date("2026-11-25T18:15:00.000Z"))).toBe("2026-11-26");
  });
});
