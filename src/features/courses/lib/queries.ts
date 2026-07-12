import { prisma } from "@/lib/prisma";
import { cache } from "react";

const courseInclude = {
  semester: true,
  classSchedules: { orderBy: { dayOfWeek: "asc" as const } },
  attendanceRecords: { orderBy: { date: "desc" as const } },
  assessments: { orderBy: { date: "asc" as const } },
  tasks: { orderBy: { dueDate: "asc" as const } },
  notes: { orderBy: { createdAt: "desc" as const } },
  gradingConfigs: { orderBy: { minPercent: "desc" as const } },
  attendanceMarksConfigs: { orderBy: { minPercent: "desc" as const } },
};

export const getCourseById = cache(async (id: string) => {
  let course = await prisma.course.findUnique({
    where: { id },
    include: courseInclude,
  });

  if (!course) return null;

  // Backfill: if no attendance assessment exists, create one on the fly.
  // Covers courses created before the attendance-row fix shipped.
  const hasAttendance = course.assessments.some(
    (a) => a.componentType === "attendance"
  );

  if (!hasAttendance) {
    // Double-check to avoid creating duplicates
    const existing = await prisma.assessment.findFirst({
      where: { courseId: course.id, componentType: "attendance" },
    });
    if (!existing) {
      await prisma.assessment.create({
        data: {
          courseId: course.id,
          componentType: "attendance",
          maxMarks: 5,
          obtainedMarks: null,
        },
      });
    }

    // Re-fetch to include the new assessment in the returned data
    course = await prisma.course.findUnique({
      where: { id },
      include: courseInclude,
    });
  }

  return course;
});

export const getCoursesBySemester = cache(async (semesterId: string) => {
  return prisma.course.findMany({
    where: { semesterId },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { tasks: true, notes: true } },
    },
  });
});

/**
 * Lightweight course list for the Link-to picker.
 * Includes semester endDate so isCourseEnded can filter on the client.
 */
export const getAllCoursesForPicker = cache(async () => {
  return prisma.course.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      color: true,
      code: true,
      semester: { select: { endDate: true } },
    },
  });
});

export const getCoursesForSelect = cache(async (semesterId?: string) => {
  return prisma.course.findMany({
    where: semesterId ? { semesterId } : undefined,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      code: true,
    },
  });
});
