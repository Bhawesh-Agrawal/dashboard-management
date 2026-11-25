import { describe, it, expect, vi, beforeEach } from "vitest";
import { currentSemesterWhere, getCurrentSemester } from "../current";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/auth", () => ({
  getCurrentUserId: vi.fn(async () => "user-sem-1"),
}));

vi.mock("@/lib/timezone-server", () => ({
  getUserTimezone: vi.fn(async () => "Asia/Kathmandu"),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    semester: {
      findFirst: vi.fn(),
    },
  },
}));

describe("currentSemesterWhere & getCurrentSemester (A2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds owner-scoped inclusive UTC day-range filter for todayDateOnly", () => {
    const where = currentSemesterWhere("user-sem-1", "2026-11-20");
    expect(where).toEqual({
      OR: [{ userId: "user-sem-1" }, { userId: null }],
      startDate: { lte: new Date("2026-11-20T23:59:59.999Z") },
      endDate: { gte: new Date("2026-11-20T00:00:00.000Z") },
    });
  });

  it("queries with overlap tie-breakers (isActive desc, startDate desc) and returns null when none match", async () => {
    vi.mocked(prisma.semester.findFirst).mockResolvedValueOnce(null);
    const res = await getCurrentSemester(
      "user-sem-1",
      new Date("2026-11-25T10:00:00.000Z")
    );
    expect(res).toBeNull();
    expect(prisma.semester.findFirst).toHaveBeenCalledWith({
      where: currentSemesterWhere("user-sem-1", "2026-11-25"),
      orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
      include: {
        courses: {
          orderBy: { name: "asc" },
        },
      },
    });
  });
});
