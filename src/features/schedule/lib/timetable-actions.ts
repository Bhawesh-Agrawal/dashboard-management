"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { ownerWhere } from "@/lib/owner-scoping";

const DAYS_ENUM = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

const BulkCreateSchema = z.object({
  semesterId: z.string().uuid(),
  courseId: z.string().uuid(),
  daysOfWeek: z.array(z.enum(DAYS_ENUM)).min(1),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  location: z.string().trim().max(120).nullable().optional(),
  effectiveStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  effectiveEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export async function bulkCreateClassSchedulesAction(
  rawInput: z.infer<typeof BulkCreateSchema>
) {
  const input = BulkCreateSchema.parse(rawInput);
  const userId = await getCurrentUserId();

  const course = await prisma.course.findFirst({
    where: {
      id: input.courseId,
      semesterId: input.semesterId,
      semester: ownerWhere(userId),
    },
    select: { id: true, semester: { select: { startDate: true, endDate: true } } },
  });
  if (!course) {
    throw new Error("Course not found");
  }

  const effStart = input.effectiveStartDate
    ? new Date(`${input.effectiveStartDate}T00:00:00.000Z`)
    : null;
  const effEnd = input.effectiveEndDate
    ? new Date(`${input.effectiveEndDate}T00:00:00.000Z`)
    : course.semester.endDate;

  const created = [];
  for (const dayOfWeek of Array.from(new Set(input.daysOfWeek))) {
    const row = await prisma.classSchedule.create({
      data: {
        courseId: input.courseId,
        dayOfWeek,
        startTime: input.startTime,
        endTime: input.endTime,
        location: input.location || null,
        effectiveStartDate: effStart,
        effectiveEndDate: effEnd,
      },
    });
    created.push(row);
  }

  revalidatePath(`/semesters/${input.semesterId}`);
  revalidatePath(`/semesters/${input.semesterId}/timetable`);
  revalidatePath(`/courses/${input.courseId}`);
  revalidatePath("/today");
  revalidatePath("/calendar");
  revalidatePath("/brief");
  return { created };
}

export async function updateTimetableSlotAction(
  id: string,
  rawInput: {
    dayOfWeek?: (typeof DAYS_ENUM)[number];
    startTime?: string;
    endTime?: string;
    location?: string | null;
  }
) {
  const userId = await getCurrentUserId();
  const existing = await prisma.classSchedule.findFirst({
    where: { id, course: { semester: ownerWhere(userId) } },
    select: { id: true, courseId: true, course: { select: { semesterId: true } } },
  });
  if (!existing) throw new Error("Schedule not found");

  const updated = await prisma.classSchedule.update({
    where: { id },
    data: {
      ...(rawInput.dayOfWeek ? { dayOfWeek: rawInput.dayOfWeek } : {}),
      ...(rawInput.startTime ? { startTime: rawInput.startTime } : {}),
      ...(rawInput.endTime ? { endTime: rawInput.endTime } : {}),
      ...(rawInput.location !== undefined ? { location: rawInput.location } : {}),
    },
  });

  revalidatePath(`/semesters/${existing.course.semesterId}/timetable`);
  revalidatePath(`/courses/${existing.courseId}`);
  revalidatePath("/today");
  revalidatePath("/calendar");
  return updated;
}

export async function bulkDeleteCourseSchedulesAction(courseId: string) {
  const userId = await getCurrentUserId();
  const course = await prisma.course.findFirst({
    where: { id: courseId, semester: ownerWhere(userId) },
    select: { id: true, semesterId: true },
  });
  if (!course) throw new Error("Course not found");

  const res = await prisma.classSchedule.deleteMany({
    where: { courseId },
  });

  revalidatePath(`/semesters/${course.semesterId}`);
  revalidatePath(`/semesters/${course.semesterId}/timetable`);
  revalidatePath(`/courses/${courseId}`);
  revalidatePath("/today");
  revalidatePath("/calendar");
  return { deleted: res.count };
}
