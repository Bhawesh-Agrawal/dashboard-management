import { prisma } from "@/lib/prisma";
import { cache } from "react";

export const getNotes = cache(async (filters?: {
  courseId?: string;
  folderId?: string;
  isDocumentLibraryEntry?: boolean;
  search?: string;
}) => {
  return prisma.note.findMany({
    where: {
      courseId: filters?.courseId,
      folderId: filters?.folderId,
      isDocumentLibraryEntry: filters?.isDocumentLibraryEntry,
      content: filters?.search ? { contains: filters.search, mode: "insensitive" } : undefined,
    },
    orderBy: { createdAt: "desc" },
    include: {
      course: { select: { id: true, name: true, color: true } },
      folder: { select: { id: true, name: true, type: true, color: true } },
      noteAttachments: { orderBy: { sortOrder: "asc" } },
    },
  });
});

export const getNoteById = cache(async (id: string) => {
  return prisma.note.findUnique({
    where: { id },
    include: {
      course: { select: { id: true, name: true, color: true } },
      folder: { select: { id: true, name: true, type: true, color: true } },
      noteAttachments: { orderBy: { sortOrder: "asc" } },
      annotations: { orderBy: [{ pageNumber: "asc" }, { createdAt: "asc" }] },
    },
  });
});

export const getDocumentLibraryNotes = cache(async (filters?: {
  folderId?: string;
  courseId?: string;
  search?: string;
}) => {
  return prisma.note.findMany({
    where: {
      isDocumentLibraryEntry: true,
      folderId: filters?.folderId,
      courseId: filters?.courseId,
      content: filters?.search ? { contains: filters.search, mode: "insensitive" } : undefined,
    },
    orderBy: { updatedAt: "desc" },
    include: {
      course: { select: { id: true, name: true, color: true } },
      folder: { select: { id: true, name: true, type: true, color: true } },
      noteAttachments: { orderBy: { sortOrder: "asc" } },
    },
  });
});
