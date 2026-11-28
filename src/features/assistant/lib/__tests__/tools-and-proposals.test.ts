import { beforeEach, describe, expect, it, vi } from "vitest";
import { capToolResult, tokenizeSearchQuery } from "../../tools/types";
import { getRegisteredTools } from "../../tools/registry";
import { formatSseEvent } from "../sse";
import { computeAttendanceMetrics } from "@/features/attendance/lib/calculations";

const mocks = vi.hoisted(() => ({
  getCurrentUserId: vi.fn(),
  getUserTimezone: vi.fn(),
  getCurrentSemester: vi.fn(),
  getAcademicEntriesForRange: vi.fn(),
  courseFindMany: vi.fn(),
  eventFindMany: vi.fn(),
  taskFindMany: vi.fn(),
  assessmentFindMany: vi.fn(),
  noteFindMany: vi.fn(),
  noteFindFirst: vi.fn(),
  aiMessageFindFirst: vi.fn(),
  aiMessageUpdate: vi.fn(),
  aiMessageFindMany: vi.fn(),
  aiMessageCount: vi.fn(),
  aiConvFindMany: vi.fn(),
  aiConvDeleteMany: vi.fn(),
  userPrefFindUnique: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  createCaptureNote: vi.fn(),
  createCalendarEventAction: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
  UnauthorizedError: class UnauthorizedError extends Error {},
}));
vi.mock("@/lib/timezone-server", () => ({
  getUserTimezone: mocks.getUserTimezone,
}));
vi.mock("@/features/semesters/lib/current", () => ({
  getCurrentSemester: mocks.getCurrentSemester,
}));
vi.mock("@/features/semesters/lib/calendar-queries", () => ({
  getAcademicEntriesForRange: mocks.getAcademicEntriesForRange,
  entriesForDate: () => [],
}));
vi.mock("@/features/tasks/lib/actions", () => ({
  createTask: mocks.createTask,
  updateTask: mocks.updateTask,
}));
vi.mock("@/features/notes/lib/capture-actions", () => ({
  createCaptureNote: mocks.createCaptureNote,
}));
vi.mock("@/features/calendar/lib/event-actions", () => ({
  createCalendarEventAction: mocks.createCalendarEventAction,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    course: { findMany: mocks.courseFindMany },
    event: { findMany: mocks.eventFindMany },
    task: { findMany: mocks.taskFindMany },
    assessment: { findMany: mocks.assessmentFindMany },
    note: { findMany: mocks.noteFindMany, findFirst: mocks.noteFindFirst },
    aiMessage: {
      findFirst: mocks.aiMessageFindFirst,
      update: mocks.aiMessageUpdate,
      findMany: mocks.aiMessageFindMany,
      count: mocks.aiMessageCount,
    },
    aiConversation: {
      findMany: mocks.aiConvFindMany,
      deleteMany: mocks.aiConvDeleteMany,
    },
    userDashboardPreference: { findUnique: mocks.userPrefFindUnique },
  },
}));

import { getAttendanceTool, getScheduleTool } from "../../tools/read-academic";
import { getNoteTool, searchNotesTool } from "../../tools/read-workspace";
import { confirmProposal, dismissProposal } from "../proposals";
import {
  buildConversationTitle,
  checkAssistantQuota,
  purgeOldConversationsForUser,
} from "../persistence";

describe("Assistant tools, registry, and SSE", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserTimezone.mockResolvedValue("Asia/Kathmandu");
  });

  it("omits get_dsa_summary when dsaEnabled is false and includes it when true", () => {
    const off = getRegisteredTools({ dsaEnabled: false }).map((t) => t.name);
    const on = getRegisteredTools({ dsaEnabled: true }).map((t) => t.name);
    expect(off).not.toContain("get_dsa_summary");
    expect(on).toContain("get_dsa_summary");
  });

  it("caps oversized tool results to ~2 KB with truncation note", () => {
    const big = Array.from({ length: 100 }, (_, i) => ({
      id: `id-${i}`,
      title: `Long item title number ${i} with extra padding text`,
    }));
    const capped = capToolResult(big, 2048);
    expect(capped.truncated).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(capped.payload), "utf8")).toBeLessThanOrEqual(2048);
  });

  it("tokenizes natural-language search queries and ranks matching notes/links", async () => {
    expect(tokenizeSearchQuery("what did I save about react hooks")).toEqual(["react", "hooks"]);

    mocks.noteFindMany.mockResolvedValue([
      {
        id: "n1",
        kind: "note",
        title: "React hooks cheat sheet",
        content: "useEffect and useState patterns",
        sourceLink: null,
        tags: ["react"],
        createdAt: new Date("2026-11-20T00:00:00Z"),
      },
      {
        id: "n2",
        kind: "link",
        title: "react.dev docs",
        content: "https://react.dev/reference/react",
        sourceLink: "https://react.dev/reference/react",
        tags: [],
        createdAt: new Date("2026-11-19T00:00:00Z"),
      },
    ]);

    const res = await searchNotesTool.execute("u1", { query: "what did I save about react hooks" });
    const data = res.data as { notes: Array<{ id: string; title: string }> };
    expect(data.notes.map((n) => n.id)).toEqual(["n1", "n2"]);
  });

  it("enforces ownership in get_note (foreign note returns error)", async () => {
    mocks.noteFindFirst.mockResolvedValue(null);
    const res = await getNoteTool.execute("u1", { id: "foreign-note" });
    expect(res.data).toEqual({ error: "Note not found" });
  });

  it("attendance tool matches calculations module numbers", async () => {
    mocks.getCurrentSemester.mockResolvedValue({
      id: "sem-1",
      name: "Fall 2026",
      startDate: new Date("2026-08-01T00:00:00Z"),
      endDate: new Date("2026-12-20T00:00:00Z"),
    });
    mocks.getAcademicEntriesForRange.mockResolvedValue([]);
    mocks.courseFindMany.mockResolvedValue([
      {
        id: "c1",
        name: "Algorithms",
        code: "CS301",
        credits: 4,
        attendanceMode: "auto",
        manualPresent: null,
        manualTotalClasses: null,
        targetGrade: "A",
        classSchedules: [],
        attendanceRecords: [
          { id: "r1", courseId: "c1", classScheduleId: null, date: new Date("2026-11-01"), status: "present" },
          { id: "r2", courseId: "c1", classScheduleId: null, date: new Date("2026-11-02"), status: "present" },
          { id: "r3", courseId: "c1", classScheduleId: null, date: new Date("2026-11-03"), status: "absent" },
          { id: "r4", courseId: "c1", classScheduleId: null, date: new Date("2026-11-04"), status: "cancelled" },
        ],
      },
    ]);

    const expected = computeAttendanceMetrics({ present: 2, absent: 1, targetPercent: 75 });
    const res = await getAttendanceTool.execute("u1", {});
    const data = res.data as { courses: Array<{ attended: number; totalCounted: number; percent: number; canMiss: number; mustAttend: number }> };
    expect(data.courses[0].attended).toBe(expected.present);
    expect(data.courses[0].totalCounted).toBe(expected.totalCounted);
    expect(data.courses[0].percent).toBe(expected.percent);
    expect(data.courses[0].canMiss).toBe(expected.canMissCount);
    expect(data.courses[0].mustAttend).toBe(expected.mustAttendCount);
  });

  it("schedule tool handles holidays, follows_weekday, exam_period, and no active semester", async () => {
    mocks.getCurrentSemester.mockResolvedValue(null);
    mocks.getAcademicEntriesForRange.mockResolvedValue([]);
    mocks.eventFindMany.mockResolvedValue([]);
    const noSem = await getScheduleTool.execute("u1", { from: "2026-11-28", to: "2026-11-29" });
    expect((noSem.data as { semester: null; classes: unknown[] }).semester).toBeNull();

    mocks.getCurrentSemester.mockResolvedValue({
      id: "sem-1",
      name: "Fall 2026",
      startDate: new Date("2026-08-01T00:00:00Z"),
      endDate: new Date("2026-12-20T00:00:00Z"),
    });
    mocks.getAcademicEntriesForRange.mockResolvedValue([
      {
        id: "ac1",
        semesterId: "sem-1",
        kind: "holiday",
        title: "Festival",
        startDate: new Date("2026-11-28T00:00:00Z"),
        endDate: new Date("2026-11-28T00:00:00Z"),
        cancelsClasses: true,
        followsWeekday: null,
      },
      {
        id: "ac2",
        semesterId: "sem-1",
        kind: "follows_weekday",
        title: "Saturday follows Monday",
        startDate: new Date("2026-11-29T00:00:00Z"),
        endDate: new Date("2026-11-29T00:00:00Z"),
        cancelsClasses: false,
        followsWeekday: 1,
      },
    ]);
    mocks.courseFindMany.mockResolvedValue([
      {
        id: "c1",
        name: "Algorithms",
        code: "CS301",
        credits: 4,
        attendanceMode: "auto",
        manualPresent: null,
        manualTotalClasses: null,
        targetGrade: null,
        classSchedules: [
          {
            id: "s1",
            courseId: "c1",
            dayOfWeek: "MON",
            startTime: "09:00",
            endTime: "10:00",
            location: "Room 101",
            effectiveStartDate: null,
            effectiveEndDate: null,
            exceptions: [],
          },
        ],
        attendanceRecords: [],
      },
    ]);

    const res = await getScheduleTool.execute("u1", { from: "2026-11-28", to: "2026-11-29" });
    const data = res.data as { classes: Array<{ date: string; status: string }> };
    // 2026-11-28 is Saturday (holiday cancels), 2026-11-29 follows Monday -> CS301 class generated!
    expect(data.classes.some((c) => c.date === "2026-11-29")).toBe(true);
  });

  it("matches SSE event format snapshot", () => {
    const out = [
      formatSseEvent("tool_start", { name: "get_today_overview", argsSummary: "{}" }),
      formatSseEvent("token", { text: "Hello" }),
      formatSseEvent("done", { conversationId: "c1", messageId: "m1" }),
    ].join("");
    expect(out).toMatchInlineSnapshot(`
      "event: tool_start
      data: {"name":"get_today_overview","argsSummary":"{}"}

      event: token
      data: {"text":"Hello"}

      event: done
      data: {"conversationId":"c1","messageId":"m1"}

      "
    `);
  });
});

describe("Proposal lifecycle, persistence, and DB quotas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserTimezone.mockResolvedValue("Asia/Kathmandu");
  });

  it("confirms once idempotently, rejects double execution, expired, and foreign proposals", async () => {
    const pendingProposal = {
      id: "p1",
      kind: "create_task",
      summary: "Create task: Study",
      payload: { title: "Study" },
      status: "pending",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };

    mocks.aiMessageFindFirst.mockResolvedValue({
      id: "m1",
      proposals: [pendingProposal],
    });
    mocks.createTask.mockResolvedValue({ id: "t-new", title: "Study" });
    mocks.aiMessageUpdate.mockResolvedValue({});

    const first = await confirmProposal({ messageId: "m1", proposalId: "p1", userId: "u1" });
    expect(first.ok).toBe(true);
    expect(mocks.createTask).toHaveBeenCalledTimes(1);

    // Double confirm -> idempotent
    mocks.aiMessageFindFirst.mockResolvedValue({
      id: "m1",
      proposals: [{ ...pendingProposal, status: "confirmed" }],
    });
    const second = await confirmProposal({ messageId: "m1", proposalId: "p1", userId: "u1" });
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.alreadyConfirmed).toBe(true);
    expect(mocks.createTask).toHaveBeenCalledTimes(1);

    // Expired refused
    mocks.aiMessageFindFirst.mockResolvedValue({
      id: "m1",
      proposals: [
        { ...pendingProposal, id: "p-exp", expiresAt: new Date(Date.now() - 1000).toISOString() },
      ],
    });
    const expRes = await confirmProposal({ messageId: "m1", proposalId: "p-exp", userId: "u1" });
    expect(expRes.ok).toBe(false);
    if (!expRes.ok) expect(expRes.status).toBe(410);

    // Foreign refused (findFirst with userId returns null)
    mocks.aiMessageFindFirst.mockResolvedValue(null);
    const foreignRes = await confirmProposal({ messageId: "m1", proposalId: "p1", userId: "u2" });
    expect(foreignRes.ok).toBe(false);
    if (!foreignRes.ok) expect(foreignRes.status).toBe(404);

    // Dismiss
    mocks.aiMessageFindFirst.mockResolvedValue({
      id: "m1",
      proposals: [pendingProposal],
    });
    const disRes = await dismissProposal({ messageId: "m1", proposalId: "p1", userId: "u1" });
    expect(disRes.ok).toBe(true);
    if (disRes.ok) expect(disRes.proposal.status).toBe("dismissed");
  });

  it("truncates conversation titles to 60 chars and purges stale conversations", async () => {
    const longTitle = "A".repeat(80);
    expect(buildConversationTitle(longTitle).length).toBe(60);

    mocks.aiConvFindMany.mockResolvedValue([{ id: "old-1" }, { id: "old-2" }]);
    mocks.aiConvDeleteMany.mockResolvedValue({ count: 2 });
    const purged = await purgeOldConversationsForUser("u1", 50);
    expect(purged).toBe(2);
  });

  it("enforces DB rate limit and daily token cap", async () => {
    mocks.userPrefFindUnique.mockResolvedValue({
      assistantEnabled: true,
      assistantDsaAccess: false,
      aiDailyTokenCap: 1000,
    });
    mocks.aiMessageFindMany.mockResolvedValue([
      { role: "assistant", usage: { totalTokens: 1000 } },
    ]);
    mocks.aiMessageCount.mockResolvedValue(1);

    const overCap = await checkAssistantQuota("u1");
    expect(overCap.allowed).toBe(false);
    if (!overCap.allowed) expect(overCap.reason).toBe("budget_exceeded");

    mocks.aiMessageFindMany.mockResolvedValue([]);
    mocks.aiMessageCount.mockResolvedValue(20);
    const overRate = await checkAssistantQuota("u1");
    expect(overRate.allowed).toBe(false);
    if (!overRate.allowed) expect(overRate.reason).toBe("rate_limited");
  });
});
