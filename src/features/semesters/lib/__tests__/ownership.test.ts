import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSemester, updateSemester, deleteSemester, setActiveSemester } from "../actions";
import { prisma } from "@/lib/prisma";
import { UnauthorizedError } from "@/lib/auth";

vi.mock("@/lib/auth", () => ({
  getCurrentUserId: vi.fn(async () => "user-owner-1"),
  UnauthorizedError: class UnauthorizedError extends Error {
    constructor(msg = "Unauthorized") {
      super(msg);
      this.name = "UnauthorizedError";
    }
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    semester: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(async (ops) => Promise.all(ops)),
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("Semester Ownership Scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createSemester assigns userId to the new semester", async () => {
    (prisma.semester.create as any).mockImplementation(({ data }: any) => ({
      id: "sem-new",
      ...data,
    }));

    const result = await createSemester({
      name: "Fall 2026",
      startDate: "2026-08-01",
      endDate: "2026-12-20",
    });

    expect(prisma.semester.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-owner-1",
          name: "Fall 2026",
        }),
      })
    );
    expect(result.userId).toBe("user-owner-1");
  });

  it("updateSemester throws UnauthorizedError when semester does not belong to user", async () => {
    (prisma.semester.findFirst as any).mockResolvedValue(null);

    await expect(
      updateSemester("sem-other-user", { name: "Hacked Semester" })
    ).rejects.toThrow(UnauthorizedError);

    expect(prisma.semester.findFirst).toHaveBeenCalledWith({
      where: {
        id: "sem-other-user",
        OR: [{ userId: "user-owner-1" }, { userId: null }],
      },
    });
  });

  it("deleteSemester throws UnauthorizedError when semester does not belong to user", async () => {
    (prisma.semester.findFirst as any).mockResolvedValue(null);

    await expect(deleteSemester("sem-other-user")).rejects.toThrow(
      UnauthorizedError
    );
  });

  it("setActiveSemester throws UnauthorizedError when semester does not belong to user", async () => {
    (prisma.semester.findFirst as any).mockResolvedValue(null);

    await expect(setActiveSemester("sem-other-user")).rejects.toThrow(
      UnauthorizedError
    );
  });
});
