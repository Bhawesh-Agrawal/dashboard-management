"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUserId, UnauthorizedError } from "@/lib/auth";
import { ownerWhere } from "@/lib/owner-scoping";

export async function createAssessment(data: {
  courseId: string;
  componentType: "minor_assignment" | "attendance" | "mid_sem" | "end_sem";
  maxMarks: number;
  obtainedMarks?: number;
  date?: string;
}) {
  const userId = await getCurrentUserId();
  const course = await prisma.course.findFirst({
    where: { id: data.courseId, semester: ownerWhere(userId) },
  });
  if (!course) {
    throw new UnauthorizedError("Course not found or unauthorized");
  }

  const assessment = await prisma.assessment.create({
    data: {
      ...data,
      date: data.date ? new Date(data.date) : null,
    },
  });

  revalidatePath(`/courses/${data.courseId}`);
  return assessment;
}

export async function updateAssessment(
  id: string,
  data: {
    obtainedMarks?: number;
    maxMarks?: number;
    date?: string;
  }
) {
  const userId = await getCurrentUserId();
  const existing = await prisma.assessment.findFirst({
    where: { id, course: { semester: ownerWhere(userId) } },
  });
  if (!existing) {
    throw new UnauthorizedError("Assessment not found or unauthorized");
  }

  const assessment = await prisma.assessment.update({
    where: { id },
    data: {
      ...data,
      date: data.date ? new Date(data.date) : undefined,
    },
  });

  revalidatePath(`/courses/${assessment.courseId}`);
  return assessment;
}

export async function deleteAssessment(id: string, courseId: string) {
  const userId = await getCurrentUserId();
  const existing = await prisma.assessment.findFirst({
    where: { id, course: { id: courseId, semester: ownerWhere(userId) } },
  });
  if (!existing) {
    throw new UnauthorizedError("Assessment not found or unauthorized");
  }

  await prisma.assessment.delete({ where: { id } });
  revalidatePath(`/courses/${courseId}`);
}


