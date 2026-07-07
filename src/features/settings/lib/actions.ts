"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { DEFAULT_GRADING_CONFIG, DEFAULT_ATTENDANCE_MARKS_CONFIG } from "@/lib/constants";

export async function updateGradingConfig(courseId: string, config: { minPercent: number; gradePoint: number }[]) {
  // Delete existing course-specific config
  await prisma.gradingConfig.deleteMany({ where: { courseId } });

  // Create new config
  await prisma.gradingConfig.createMany({
    data: config.map((c) => ({
      courseId,
      minPercent: c.minPercent,
      gradePoint: c.gradePoint,
    })),
  });

  revalidatePath(`/courses/${courseId}`);
  revalidatePath("/settings");
}

export async function updateAttendanceMarksConfig(courseId: string, config: { minPercent: number; marks: number }[]) {
  await prisma.attendanceMarksConfig.deleteMany({ where: { courseId } });

  await prisma.attendanceMarksConfig.createMany({
    data: config.map((c) => ({
      courseId,
      minPercent: c.minPercent,
      marks: c.marks,
    })),
  });

  revalidatePath(`/courses/${courseId}`);
  revalidatePath("/settings");
}

export async function resetGradingToDefaults(courseId: string) {
  await prisma.gradingConfig.deleteMany({ where: { courseId } });

  await prisma.gradingConfig.createMany({
    data: DEFAULT_GRADING_CONFIG.map((c) => ({
      courseId,
      minPercent: c.minPercent,
      gradePoint: c.gradePoint,
    })),
  });

  revalidatePath(`/courses/${courseId}`);
  revalidatePath("/settings");
}

export async function resetAttendanceToDefaults(courseId: string) {
  await prisma.attendanceMarksConfig.deleteMany({ where: { courseId } });

  await prisma.attendanceMarksConfig.createMany({
    data: DEFAULT_ATTENDANCE_MARKS_CONFIG.map((c) => ({
      courseId,
      minPercent: c.minPercent,
      marks: c.marks,
    })),
  });

  revalidatePath(`/courses/${courseId}`);
  revalidatePath("/settings");
}
