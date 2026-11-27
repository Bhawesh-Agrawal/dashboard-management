import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  entriesForDate,
  getEntryRangeDay,
  type AcademicCalendarEntryItem,
} from "../academic-calendar-dates";

const mockFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    academicCalendarEntry: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

import { getAcademicEntriesForRange } from "../calendar-queries";

describe("entriesForDate", () => {
  const entries: AcademicCalendarEntryItem[] = [
    {
      id: "e-note",
      semesterId: "s1",
      kind: "note",
      title: "Course registration",
      startDate: "2027-01-26",
      endDate: "2027-01-26",
      cancelsClasses: false,
      followsWeekday: null,
    },
    {
      id: "e-fw",
      semesterId: "s1",
      kind: "follows_weekday",
      title: "Monday timetable",
      startDate: "2027-01-26",
      endDate: "2027-01-26",
      cancelsClasses: false,
      followsWeekday: 1,
    },
    {
      id: "e-exam",
      semesterId: "s1",
      kind: "exam_period",
      title: "Mid-Semester Examinations",
      startDate: "2027-01-25",
      endDate: "2027-01-30",
      cancelsClasses: true,
      followsWeekday: null,
    },
    {
      id: "e-noclass",
      semesterId: "s1",
      kind: "no_classes",
      title: "CURA",
      startDate: "2027-01-26",
      endDate: "2027-01-27",
      cancelsClasses: true,
      followsWeekday: null,
    },
    {
      id: "e-hol",
      semesterId: "s1",
      kind: "holiday",
      title: "Republic Day",
      startDate: "2027-01-26",
      endDate: "2027-01-26",
      cancelsClasses: true,
      followsWeekday: null,
    },
  ];

  it("expands inclusive date ranges and orders deterministically", () => {
    const res = entriesForDate(entries, "2027-01-26");
    expect(res.map((e) => e.id)).toEqual([
      "e-noclass", // holiday & no_classes first (sorted by startDate: 2027-01-26, title: CURA < Republic Day)
      "e-hol",
      "e-exam",
      "e-fw",
      "e-note",
    ]);

    expect(entriesForDate(entries, "2027-01-28").map((e) => e.id)).toEqual(["e-exam"]);
    expect(entriesForDate(entries, "2027-01-31")).toEqual([]);
  });

  it("computes range day index and total days", () => {
    expect(
      getEntryRangeDay(
        { startDate: "2027-01-28", endDate: "2027-02-04" },
        "2027-01-30"
      )
    ).toEqual({ day: 3, totalDays: 8 });
  });
});

describe("getAcademicEntriesForRange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries overlapping entries across all semesters scoped by userId", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "1",
        semesterId: "sem-upcoming",
        semester: { name: "Sem 4" },
        kind: "holiday",
        title: "Republic Day",
        startDate: new Date("2027-01-26T00:00:00.000Z"),
        endDate: new Date("2027-01-26T00:00:00.000Z"),
        cancelsClasses: true,
        followsWeekday: null,
        notes: null,
      },
    ]);

    const res = await getAcademicEntriesForRange("user-1", "2027-01-01", "2027-01-31");
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "user-1" }),
      })
    );
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({
      id: "1",
      semesterName: "Sem 4",
      startDate: "2027-01-26",
      endDate: "2027-01-26",
    });
  });
});
