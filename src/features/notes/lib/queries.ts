import { prisma } from "@/lib/prisma";
import { cache } from "react";

export const getNotes = cache(async (filters?: {
  courseId?: string;
  search?: string;
}) => {
  return prisma.note.findMany({
    where: {
      courseId: filters?.courseId,
      content: filters?.search ? { contains: filters.search, mode: "insensitive" } : undefined,
    },
    orderBy: { createdAt: "desc" },
    include: {
      course: { select: { id: true, name: true, color: true } },
    },
  });
});

export const getNoteById = cache(async (id: string) => {
  return prisma.note.findUnique({
    where: { id },
    include: {
      course: { select: { id: true, name: true, color: true } },
    },
  });
});
