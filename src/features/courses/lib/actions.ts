"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createCourse(data: {
  semesterId: string;
  name: string;
  code?: string;
  credits: number;
  instructor?: string;
  color?: string;
  targetGrade?: string;
}) {
  // Create the course and its attendance assessment row.
  // The attendance row is system-managed: maxMarks=5, obtainedMarks always null
  // (the value is computed live from AttendanceRecords, never stored).
  const course = await prisma.course.create({ data });
  await prisma.assessment.create({
    data: {
      courseId: course.id,
      componentType: "attendance",
      maxMarks: 5,
      obtainedMarks: null,
    },
  });

  revalidatePath("/semesters");
  revalidatePath(`/semesters/${data.semesterId}`);
  revalidatePath(`/courses/${course.id}`);
  return course;
}

export async function updateCourse(
  id: string,
  data: {
    name?: string;
    code?: string;
    credits?: number;
    instructor?: string;
    color?: string;
    targetGrade?: string;
  }
) {
  const course = await prisma.course.update({ where: { id }, data });
  revalidatePath("/semesters");
  revalidatePath(`/courses/${id}`);
  return course;
}

export async function deleteCourse(id: string) {
  const course = await prisma.course.delete({
    where: { id },
    select: { semesterId: true },
  });
  revalidatePath("/semesters");
  revalidatePath(`/semesters/${course.semesterId}`);
}

export async function updateAttendanceMode(
  id: string,
  data: {
    attendanceMode: "auto" | "manual";
    manualPresent?: number | null;
    manualTotalClasses?: number | null;
  }
) {
  const updateData: {
    attendanceMode: "auto" | "manual";
    manualPresent?: number | null;
    manualTotalClasses?: number | null;
  } = { attendanceMode: data.attendanceMode };

  if (data.attendanceMode === "manual") {
    updateData.manualPresent = data.manualPresent ?? null;
    updateData.manualTotalClasses = data.manualTotalClasses ?? null;
  } else {
    // Clear manual fields when switching back to auto
    updateData.manualPresent = null;
    updateData.manualTotalClasses = null;
  }

  const course = await prisma.course.update({ where: { id }, data: updateData });
  revalidatePath("/semesters");
  revalidatePath(`/courses/${id}`);
  return course;
}
