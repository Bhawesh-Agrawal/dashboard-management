import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockGetCurrentUserId,
  mockRevalidatePath,
  mockPrisma,
} = vi.hoisted(() => ({
  mockGetCurrentUserId: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockPrisma: {
    domain: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
    project: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
    milestone: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
    routine: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
    routineCompletion: { upsert: vi.fn(), delete: vi.fn() },
    note: { findFirst: vi.fn(), update: vi.fn() },
    course: { findMany: vi.fn() },
    task: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUserId: mockGetCurrentUserId,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

import { createDomain, updateDomain, deleteDomain } from "@/features/domains/lib/actions";
import { createProject, updateProject, deleteProject, toggleMilestoneDone } from "@/features/projects/lib/actions";
import { createRoutine, updateRoutine, deleteRoutine } from "@/features/routines/lib/actions";
import { completeRoutineAction } from "@/features/routines/lib/actions-completions";
import { convertDocxToMarkdown } from "@/features/notes/lib/actions-convert";
import { parseQuickCaptureAction } from "@/features/notes/lib/actions-nlp";
import { searchAction } from "@/features/search/lib/actions";
import { askQuestion } from "@/features/ask/lib/actions";

describe("A5 auth and owner scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated calls across all guarded server actions", async () => {
    mockGetCurrentUserId.mockRejectedValue(new Error("Unauthorized"));

    await expect(createDomain({ name: "Study" })).rejects.toThrow("Unauthorized");
    await expect(createProject({ domainId: "d1", name: "Proj" })).rejects.toThrow("Unauthorized");
    await expect(
      createRoutine({ name: "Read", timeOfDay: "morning", activeDays: ["MON"] })
    ).rejects.toThrow("Unauthorized");
    await expect(completeRoutineAction("r1")).rejects.toThrow("Unauthorized");
    await expect(convertDocxToMarkdown("n1")).rejects.toThrow("Unauthorized");
    await expect(parseQuickCaptureAction("hello")).rejects.toThrow("Unauthorized");
    await expect(searchAction("notes")).rejects.toThrow("Unauthorized");
    await expect(askQuestion("what is due?")).rejects.toThrow("Unauthorized");
  });

  it("rejects mutations when entity is not owned by the current user", async () => {
    mockGetCurrentUserId.mockResolvedValue("user-a");
    mockPrisma.domain.findFirst.mockResolvedValue(null);
    mockPrisma.project.findFirst.mockResolvedValue(null);
    mockPrisma.milestone.findFirst.mockResolvedValue(null);
    mockPrisma.routine.findFirst.mockResolvedValue(null);
    mockPrisma.note.findFirst.mockResolvedValue(null);

    await expect(updateDomain("d-other", { name: "X" })).rejects.toThrow("Domain not found");
    await expect(deleteDomain("d-other")).rejects.toThrow("Domain not found");
    await expect(createProject({ domainId: "d-other", name: "X" })).rejects.toThrow("Domain not found");
    await expect(updateProject("p-other", { name: "X" })).rejects.toThrow("Project not found");
    await expect(deleteProject("p-other")).rejects.toThrow("Project not found");
    await expect(toggleMilestoneDone("m-other", "p-other")).rejects.toThrow("Milestone not found");
    await expect(updateRoutine("r-other", { name: "X" })).rejects.toThrow("Routine not found");
    await expect(deleteRoutine("r-other")).rejects.toThrow("Routine not found");
    await expect(completeRoutineAction("r-other")).rejects.toThrow("Routine not found");

    const convertRes = await convertDocxToMarkdown("n-other");
    expect(convertRes).toEqual({ ok: false, error: "Note not found" });

    expect(mockPrisma.domain.update).not.toHaveBeenCalled();
    expect(mockPrisma.project.update).not.toHaveBeenCalled();
    expect(mockPrisma.routine.update).not.toHaveBeenCalled();
    expect(mockPrisma.routineCompletion.upsert).not.toHaveBeenCalled();
  });

  it("sets userId on createDomain and createRoutine", async () => {
    mockGetCurrentUserId.mockResolvedValue("user-a");
    mockPrisma.domain.create.mockResolvedValue({ id: "d1", name: "Study", userId: "user-a" });
    mockPrisma.routine.create.mockResolvedValue({ id: "r1", name: "Read", userId: "user-a" });

    await createDomain({ name: "Study" });
    await createRoutine({ name: "Read", timeOfDay: "morning", activeDays: ["MON"] });

    expect(mockPrisma.domain.create).toHaveBeenCalledWith({
      data: { name: "Study", userId: "user-a" },
    });
    expect(mockPrisma.routine.create).toHaveBeenCalledWith({
      data: { name: "Read", timeOfDay: "morning", activeDays: ["MON"], userId: "user-a" },
    });
  });
});
