"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/auth";
import type { FolderType } from "@prisma/client";

// ─── Default Folder Structure ────────────────────────────────

const DEFAULT_FOLDERS: { name: string; type: FolderType; icon: string; color: string }[] = [
  { name: "Previous Year Questions", type: "PYQ", icon: "file-text", color: "#3B82F6" },
  { name: "Resource Books", type: "RESOURCE_BOOK", icon: "book-open", color: "#8B5CF6" },
  { name: "Lecture Notes", type: "LECTURE_NOTE", icon: "graduation-cap", color: "#10B981" },
  { name: "Assignments", type: "ASSIGNMENT", icon: "clipboard-list", color: "#F59E0B" },
  { name: "Reference Materials", type: "REFERENCE", icon: "bookmark", color: "#EF4444" },
  { name: "Projects", type: "PROJECT", icon: "folder-kanban", color: "#06B6D4" },
];

// ─── Create Default Folders ──────────────────────────────────

export async function createDefaultFolders(): Promise<
  { ok: true; data: { id: string; name: string }[] } | { ok: false; error: string }
> {
  try {
    const userId = await getCurrentUserId();

    // Check if user already has folders
    const existing = await prisma.documentFolder.findFirst({
      where: { userId },
      select: { id: true },
    });

    if (existing) {
      return { ok: false, error: "Default folders already exist" };
    }

    const created = await prisma.$transaction(
      DEFAULT_FOLDERS.map((folder, index) =>
        prisma.documentFolder.create({
          data: {
            userId,
            name: folder.name,
            type: folder.type,
            icon: folder.icon,
            color: folder.color,
            sortOrder: index,
          },
          select: { id: true, name: true },
        })
      )
    );

    revalidatePath("/notes");

    return { ok: true, data: created };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to create default folders:", message);
    return { ok: false, error: "Failed to create default folders" };
  }
}

// ─── Create Folder ───────────────────────────────────────────

export async function createFolder(data: {
  name: string;
  description?: string;
  type?: FolderType;
  color?: string;
  icon?: string;
  parentId?: string;
  courseId?: string;
  semesterId?: string;
}): Promise<{ ok: true; data: { id: string; name: string } } | { ok: false; error: string }> {
  try {
    const userId = await getCurrentUserId();

    // Verify parent folder belongs to user if provided
    if (data.parentId) {
      const parent = await prisma.documentFolder.findUnique({
        where: { id: data.parentId },
        select: { userId: true },
      });
      if (!parent || parent.userId !== userId) {
        return { ok: false, error: "Parent folder not found" };
      }
    }

    // Get next sort order
    const maxSort = await prisma.documentFolder.aggregate({
      where: { userId, parentId: data.parentId ?? null },
      _max: { sortOrder: true },
    });

    const folder = await prisma.documentFolder.create({
      data: {
        userId,
        name: data.name,
        description: data.description,
        type: data.type ?? "GENERAL",
        color: data.color,
        icon: data.icon,
        parentId: data.parentId,
        courseId: data.courseId,
        semesterId: data.semesterId,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
      select: { id: true, name: true },
    });

    revalidatePath("/notes");

    return { ok: true, data: folder };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to create folder:", message);
    return { ok: false, error: "Failed to create folder" };
  }
}

// ─── Update Folder ───────────────────────────────────────────

export async function updateFolder(
  id: string,
  data: {
    name?: string;
    description?: string | null;
    type?: FolderType;
    color?: string | null;
    icon?: string | null;
    isPinned?: boolean;
    sortOrder?: number;
    courseId?: string | null;
    semesterId?: string | null;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const userId = await getCurrentUserId();

    const folder = await prisma.documentFolder.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!folder) {
      return { ok: false, error: "Folder not found" };
    }

    if (folder.userId !== userId) {
      return { ok: false, error: "Access denied" };
    }

    await prisma.documentFolder.update({
      where: { id },
      data,
    });

    revalidatePath("/notes");

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to update folder:", message);
    return { ok: false, error: "Failed to update folder" };
  }
}

// ─── Delete Folder ───────────────────────────────────────────

export async function deleteFolder(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const userId = await getCurrentUserId();

    const folder = await prisma.documentFolder.findUnique({
      where: { id },
      select: { userId: true, children: { select: { id: true } } },
    });

    if (!folder) {
      return { ok: false, error: "Folder not found" };
    }

    if (folder.userId !== userId) {
      return { ok: false, error: "Access denied" };
    }

    // Unlink notes (set folderId to null)
    await prisma.note.updateMany({
      where: { folderId: id },
      data: { folderId: null },
    });

    // Move children to root level (set parentId to null)
    await prisma.documentFolder.updateMany({
      where: { parentId: id },
      data: { parentId: null },
    });

    await prisma.documentFolder.delete({ where: { id } });

    revalidatePath("/notes");

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to delete folder:", message);
    return { ok: false, error: "Failed to delete folder" };
  }
}

// ─── Get Folders ─────────────────────────────────────────────

export async function getFolders() {
  const userId = await getCurrentUserId();

  return prisma.documentFolder.findMany({
    where: { userId },
    orderBy: [{ isPinned: "desc" }, { sortOrder: "asc" }],
    include: {
      _count: {
        select: { notes: true, children: true },
      },
    },
  });
}

// ─── Get Folder by ID ────────────────────────────────────────

export async function getFolderById(id: string) {
  const userId = await getCurrentUserId();

  return prisma.documentFolder.findUnique({
    where: { id },
    include: {
      parent: { select: { id: true, name: true } },
      children: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, type: true, color: true, icon: true },
      },
      _count: {
        select: { notes: true },
      },
    },
  });
}

// ─── Reorder Folders ─────────────────────────────────────────

export async function reorderFolders(
  ids: string[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const userId = await getCurrentUserId();

    // Verify all folders belong to user
    const folders = await prisma.documentFolder.findMany({
      where: { id: { in: ids } },
      select: { id: true, userId: true },
    });

    if (folders.some((f) => f.userId !== userId)) {
      return { ok: false, error: "Access denied" };
    }

    await prisma.$transaction(
      ids.map((id, index) =>
        prisma.documentFolder.update({
          where: { id },
          data: { sortOrder: index },
        })
      )
    );

    revalidatePath("/notes");

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to reorder folders:", message);
    return { ok: false, error: "Failed to reorder folders" };
  }
}
