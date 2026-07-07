"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createSemester(data: {
  name: string;
  startDate: string;
  endDate: string;
  gradingScale?: "ten_point" | "four_point";
}) {
  const semester = await prisma.semester.create({
    data: {
      name: data.name,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      gradingScale: data.gradingScale || "ten_point",
    },
  });

  revalidatePath("/semesters");
  return semester;
}

export async function updateSemester(
  id: string,
  data: {
    name?: string;
    startDate?: string;
    endDate?: string;
    gradingScale?: "ten_point" | "four_point";
  }
) {
  const semester = await prisma.semester.update({
    where: { id },
    data: {
      ...data,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      endDate: data.endDate ? new Date(data.endDate) : undefined,
    },
  });

  revalidatePath("/semesters");
  revalidatePath(`/semesters/${id}`);
  return semester;
}

export async function deleteSemester(id: string) {
  await prisma.semester.delete({ where: { id } });
  revalidatePath("/semesters");
}

export async function setActiveSemester(id: string) {
  // Deactivate all semesters, then activate the selected one
  await prisma.$transaction([
    prisma.semester.updateMany({ data: { isActive: false } }),
    prisma.semester.update({ where: { id }, data: { isActive: true } }),
  ]);

  revalidatePath("/semesters");
  revalidatePath("/today");
}
