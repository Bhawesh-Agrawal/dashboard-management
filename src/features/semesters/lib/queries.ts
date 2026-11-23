import { prisma } from "@/lib/prisma";
import { cache } from "react";
import { getCurrentUserId } from "@/lib/auth";

export const getSemesters = cache(async () => {
  const userId = await getCurrentUserId();
  return prisma.semester.findMany({
    where: { OR: [{ userId }, { userId: null }] },
    orderBy: { startDate: "desc" },
    include: {
      courses: {
        select: {
          id: true,
          credits: true,
          semesterId: true,
          attendanceMode: true,
          manualPresent: true,
          manualTotalClasses: true,
        },
      },
    },
  });
});

export const getSemesterById = cache(async (id: string) => {
  const userId = await getCurrentUserId();
  return prisma.semester.findFirst({
    where: { id, OR: [{ userId }, { userId: null }] },
    include: {
      courses: {
        orderBy: { name: "asc" },
        include: {
          _count: { select: { tasks: true, notes: true, attendanceRecords: true } },
        },
      },
    },
  });
});

export const getActiveSemester = cache(async () => {
  const userId = await getCurrentUserId();
  return prisma.semester.findFirst({
    where: { isActive: true, OR: [{ userId }, { userId: null }] },
    include: {
      courses: {
        orderBy: { name: "asc" },
      },
    },
  });
});

export const getSemesterOptions = cache(async () => {
  const userId = await getCurrentUserId();
  return prisma.semester.findMany({
    where: { OR: [{ userId }, { userId: null }] },
    orderBy: { startDate: "desc" },
    select: {
      id: true,
      name: true,
    },
  });
});
