import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateTaskDueCandidates,
  generateCalendarEventCandidates,
} from "../scheduler";
import { buildMorningBriefPayload } from "@/features/briefs/lib/build";

const mockData = {
  tasks: [] as Array<{
    id: string;
    userId: string;
    title: string;
    status: string;
    dueDate: Date | null;
    course: { name: string } | null;
  }>,
  events: [] as Array<{
    id: string;
    userId: string;
    title: string;
    dateTime: Date;
    location: string | null;
  }>,
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    task: {
      findMany: vi.fn(async () =>
        mockData.tasks.filter((t) => t.status === "open" && t.dueDate !== null)
      ),
    },
    event: {
      findMany: vi.fn(async () => mockData.events),
    },
  },
}));

describe("Task & Calendar Event Triggers (Item 7)", () => {
  beforeEach(() => {
    mockData.tasks = [];
    mockData.events = [];
  });

  it("skips date-only tasks (local 00:00) for task_due pushes while Morning Brief includes them", async () => {
    // 2026-11-25 00:00 Asia/Kathmandu = 2026-11-24T18:15:00.000Z
    mockData.tasks = [
      {
        id: "t-date-only",
        userId: "u1",
        title: "Date-only essay",
        status: "open",
        dueDate: new Date("2026-11-24T18:15:00.000Z"),
        course: null,
      },
    ];

    // Check at 23:50 before midnight or 00:00 NPT -> never fires task_due
    const candidates = await generateTaskDueCandidates(
      "u1",
      new Date("2026-11-24T18:15:00.000Z"),
      "Asia/Kathmandu"
    );
    expect(candidates).toHaveLength(0);

    // Included in Morning Brief
    const brief = buildMorningBriefPayload({
      forDate: "2026-11-25",
      hasCurrentSemester: false,
      classes: [],
      events: [],
      tasks: [
        {
          id: "t-date-only",
          title: "Date-only essay",
          dueDate: "2026-11-25",
          isOverdue: false,
        },
      ],
      travel: [],
      assessments: [],
    });
    expect(brief.sections.find((s) => s.id === "tasks")?.items[0].label).toBe(
      "Date-only essay"
    );
  });

  it("fires task_due only for open tasks with explicit time within the 15-minute lead window", async () => {
    // 14:00 NPT = 08:15 UTC
    mockData.tasks = [
      {
        id: "t-timed",
        userId: "u1",
        title: "Submit lab",
        status: "open",
        dueDate: new Date("2026-11-25T08:15:00.000Z"),
        course: { name: "OS" },
      },
      {
        id: "t-done",
        userId: "u1",
        title: "Done lab",
        status: "done",
        dueDate: new Date("2026-11-25T08:15:00.000Z"),
        course: null,
      },
    ];

    // 13:40 NPT (20m before) -> too early
    const early = await generateTaskDueCandidates(
      "u1",
      new Date("2026-11-25T07:55:00.000Z"),
      "Asia/Kathmandu"
    );
    expect(early).toHaveLength(0);

    // 13:50 NPT (10m before) -> fires for t-timed only
    const inWindow = await generateTaskDueCandidates(
      "u1",
      new Date("2026-11-25T08:05:00.000Z"),
      "Asia/Kathmandu"
    );
    expect(inWindow).toHaveLength(1);
    expect(inWindow[0].entityId).toBe("t-timed");
    expect(inWindow[0].dedupKey).toBe("task_due:t-timed:2026-11-25");
  });

  it("fires calendar_event according to configured reminderMinutes lead time", async () => {
    // 16:00 NPT = 10:15 UTC
    mockData.events = [
      {
        id: "ev-1",
        userId: "u1",
        title: "Project Sync",
        dateTime: new Date("2026-11-25T10:15:00.000Z"),
        location: "Room 2",
      },
    ];

    // 15:35 NPT (25m before): skipped with default 15m, fires with 30m
    const atDefault = await generateCalendarEventCandidates(
      "u1",
      new Date("2026-11-25T09:50:00.000Z"),
      "Asia/Kathmandu",
      { minutesBefore: 15 }
    );
    expect(atDefault).toHaveLength(0);

    const atCustom30 = await generateCalendarEventCandidates(
      "u1",
      new Date("2026-11-25T09:50:00.000Z"),
      "Asia/Kathmandu",
      { minutesBefore: 30 }
    );
    expect(atCustom30).toHaveLength(1);
    expect(atCustom30[0].dedupKey).toBe("calendar_event:ev-1:2026-11-25");
  });
});
