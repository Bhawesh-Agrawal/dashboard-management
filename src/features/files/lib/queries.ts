import { prisma } from "@/lib/prisma";
import { cache } from "react";

export const getFilesBySemester = cache(async (semesterId: string) => {
  return prisma.fileAttachment.findMany({
    where: { semesterId },
    orderBy: { uploadedAt: "desc" },
  });
});

export const getFilesByCourse = cache(async (courseId: string) => {
  return prisma.fileAttachment.findMany({
    where: { courseId },
    orderBy: { uploadedAt: "desc" },
  });
});

export const getFilesByUser = cache(async (userId: string) => {
  return prisma.fileAttachment.findMany({
    where: { userId },
    orderBy: { uploadedAt: "desc" },
    include: {
      semester: { select: { id: true, name: true } },
      course: { select: { id: true, name: true, code: true } },
    },
  });
});
