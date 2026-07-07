"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createAssessment(data: {
  courseId: string;
  componentType: "minor_assignment" | "attendance" | "mid_sem" | "end_sem";
  maxMarks: number;
  obtainedMarks?: number;
  date?: string;
}) {
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
  await prisma.assessment.delete({ where: { id } });
  revalidatePath(`/courses/${courseId}`);
}


