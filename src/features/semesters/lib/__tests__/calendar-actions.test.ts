import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCurrentUserId,
  mockSemesterFindFirst,
  mockEntryFindMany,
  mockEntryCreate,
  mockEntryFindFirst,
  mockEntryDelete,
} = vi.hoisted(() => ({
  mockGetCurrentUserId: vi.fn(),
  mockSemesterFindFirst: vi.fn(),
  mockEntryFindMany: vi.fn(),
  mockEntryCreate: vi.fn(),
  mockEntryFindFirst: vi.fn(),
  mockEntryDelete: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUserId: mockGetCurrentUserId,
}));

vi.mock("@/lib/owner-scoping", () => ({
  ownerWhere: (userId: string) => ({ OR: [{ userId }, { userId: null }] }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    semester: { findFirst: mockSemesterFindFirst },
    academicCalendarEntry: {
      findMany: mockEntryFindMany,
      create: mockEntryCreate,
      findFirst: mockEntryFindFirst,
      delete: mockEntryDelete,
    },
  },
}));

import {
  createAcademicCalendarEntry,
  defaultCancelsClassesForKind,
  deleteAcademicCalendarEntry,
  listAcademicCalendarEntries,
} from "../calendar-actions";

const SEM_ID = "11111111-1111-4111-8111-111111111111";

describe("AcademicCalendarEntry server actions (Item 2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUserId.mockResolvedValue("user-1");
  });

  it("sets default cancelsClasses correctly by kind", () => {
    expect(defaultCancelsClassesForKind("holiday")).toBe(true);
    expect(defaultCancelsClassesForKind("break")).toBe(true);
    expect(defaultCancelsClassesForKind("no_classes")).toBe(true);
    expect(defaultCancelsClassesForKind("exam_period")).toBe(true);
    expect(defaultCancelsClassesForKind("follows_weekday")).toBe(false);
    expect(defaultCancelsClassesForKind("note")).toBe(false);
  });

  it("rejects creating or listing entries when semester does not belong to user", async () => {
    mockSemesterFindFirst.mockResolvedValue(null);

    await expect(listAcademicCalendarEntries(SEM_ID)).rejects.toThrow("Semester not found");
    await expect(
      createAcademicCalendarEntry({
        semesterId: SEM_ID,
        kind: "holiday",
        title: "Republic Day",
        startDate: "2027-01-26",
      })
    ).rejects.toThrow("Semester not found");
  });

  it("creates entry scoped by userId with endDate defaulting to startDate", async () => {
    mockSemesterFindFirst.mockResolvedValue({ id: SEM_ID });
    mockEntryCreate.mockImplementation(async ({ data }) => ({ id: "e-1", ...data }));

    const entry = await createAcademicCalendarEntry({
      semesterId: SEM_ID,
      kind: "holiday",
      title: "Republic Day",
      startDate: "2027-01-26",
    });

    expect(entry.userId).toBe("user-1");
    expect(entry.cancelsClasses).toBe(true);
    expect(entry.endDate.toISOString().slice(0, 10)).toBe("2027-01-26");
  });

  it("rejects deleting entry owned by another user", async () => {
    mockEntryFindFirst.mockResolvedValue(null);
    await expect(deleteAcademicCalendarEntry("e-other")).rejects.toThrow(
      "Calendar entry not found"
    );
    expect(mockEntryDelete).not.toHaveBeenCalled();
  });
});
