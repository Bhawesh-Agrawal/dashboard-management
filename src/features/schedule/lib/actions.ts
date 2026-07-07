"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createClassSchedule(data: {
  courseId: string;
  dayOfWeek: "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";
  startTime: string;
  endTime: string;
  location?: string;
}) {
  const schedule = await prisma.classSchedule.create({ data });
  revalidatePath(`/courses/${data.courseId}`);
  return schedule;
}

export async function deleteClassSchedule(id: string, courseId: string) {
  await prisma.classSchedule.delete({ where: { id } });
  revalidatePath(`/courses/${courseId}`);
}
