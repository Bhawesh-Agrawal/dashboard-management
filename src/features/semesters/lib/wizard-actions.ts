"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { ownerWhere } from "@/lib/owner-scoping";

const CopyCoursesSchema = z.object({
  targetSemesterId: z.string().uuid(),
  sourceSemesterId: z.string().uuid(),
});

/**
 * Copy course metadata (name, code, credits, instructor, color, targetGrade)
 * from a previous semester into targetSemesterId without copying schedules.
 */
export async function copyCoursesFromSemesterAction(
  rawInput: z.infer<typeof CopyCoursesSchema>
) {
  const { targetSemesterId, sourceSemesterId } = CopyCoursesSchema.parse(rawInput);
  if (targetSemesterId === sourceSemesterId) {
    throw new Error("Source and target semesters must be different");
  }

  const userId = await getCurrentUserId();
  const [target, source] = await Promise.all([
    prisma.semester.findFirst({
      where: { id: targetSemesterId, ...ownerWhere(userId) },
      select: { id: true },
    }),
    prisma.semester.findFirst({
      where: { id: sourceSemesterId, ...ownerWhere(userId) },
      select: { id: true },
    }),
  ]);

  if (!target || !source) {
    throw new Error("Semester not found");
  }

  const sourceCourses = await prisma.course.findMany({
    where: { semesterId: sourceSemesterId },
    orderBy: { name: "asc" },
  });

  if (sourceCourses.length === 0) {
    return { copied: [] as Array<{ id: string; name: string; code: string | null; credits: number; instructor: string | null }> };
  }

  const created = [];
  for (const c of sourceCourses) {
    const row = await prisma.course.create({
      data: {
        semesterId: targetSemesterId,
        name: c.name,
        code: c.code,
        credits: c.credits,
        instructor: c.instructor,
        color: c.color,
        targetGrade: c.targetGrade,
      },
      select: {
        id: true,
        name: true,
        code: true,
        credits: true,
        instructor: true,
      },
    });
    created.push(row);
  }

  revalidatePath(`/semesters/${targetSemesterId}`);
  revalidatePath("/semesters/setup");
  return { copied: created };
}
