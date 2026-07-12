import { prisma } from "@/lib/prisma";
import { cache } from "react";

export const getSemesters = cache(async () => {
  return prisma.semester.findMany({
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
  return prisma.semester.findUnique({
    where: { id },
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
  return prisma.semester.findFirst({
    where: { isActive: true },
    include: {
      courses: {
        orderBy: { name: "asc" },
      },
    },
  });
});

export const getSemesterOptions = cache(async () => {
  return prisma.semester.findMany({
    orderBy: { startDate: "desc" },
    select: {
      id: true,
      name: true,
    },
  });
});
