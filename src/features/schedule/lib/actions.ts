"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUserId, UnauthorizedError } from "@/lib/auth";

export async function createClassSchedule(data: {
  courseId: string;
  dayOfWeek: "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";
  startTime: string;
  endTime: string;
  location?: string;
  effectiveStartDate?: string;
  effectiveEndDate?: string;
}) {
  const userId = await getCurrentUserId();
  const course = await prisma.course.findFirst({
    where: { id: data.courseId, semester: { OR: [{ userId }, { userId: null }] } },
  });
  if (!course) {
    throw new UnauthorizedError("Course not found or unauthorized");
  }

  const schedule = await prisma.classSchedule.create({
    data: {
      courseId: data.courseId,
      dayOfWeek: data.dayOfWeek,
      startTime: data.startTime,
      endTime: data.endTime,
      location: data.location,
      effectiveStartDate: data.effectiveStartDate ? new Date(data.effectiveStartDate) : null,
      effectiveEndDate: data.effectiveEndDate ? new Date(data.effectiveEndDate) : null,
    },
  });
  revalidatePath(`/courses/${data.courseId}`);
  return schedule;
}

export async function updateClassSchedule(
  id: string,
  courseId: string,
  data: {
    startTime?: string;
    endTime?: string;
    location?: string;
    effectiveStartDate?: string | null;
    effectiveEndDate?: string | null;
  }
) {
  const userId = await getCurrentUserId();
  const existing = await prisma.classSchedule.findFirst({
    where: { id, course: { id: courseId, semester: { OR: [{ userId }, { userId: null }] } } },
  });
  if (!existing) {
    throw new UnauthorizedError("Class schedule not found or unauthorized");
  }

  const schedule = await prisma.classSchedule.update({
    where: { id },
    data: {
      ...(data.startTime !== undefined && { startTime: data.startTime }),
      ...(data.endTime !== undefined && { endTime: data.endTime }),
      ...(data.location !== undefined && { location: data.location }),
      ...(data.effectiveStartDate !== undefined && {
        effectiveStartDate: data.effectiveStartDate ? new Date(data.effectiveStartDate) : null,
      }),
      ...(data.effectiveEndDate !== undefined && {
        effectiveEndDate: data.effectiveEndDate ? new Date(data.effectiveEndDate) : null,
      }),
    },
  });
  revalidatePath(`/courses/${courseId}`);
  return schedule;
}

export async function deleteClassSchedule(id: string, courseId: string) {
  const userId = await getCurrentUserId();
  const existing = await prisma.classSchedule.findFirst({
    where: { id, course: { id: courseId, semester: { OR: [{ userId }, { userId: null }] } } },
  });
  if (!existing) {
    throw new UnauthorizedError("Class schedule not found or unauthorized");
  }

  await prisma.classSchedule.delete({ where: { id } });
  revalidatePath(`/courses/${courseId}`);
}

// ─── Schedule Exceptions ─────────────────────────────────

export async function createScheduleException(data: {
  classScheduleId: string;
  date: string;
  type: "cancelled" | "rescheduled";
  newStartTime?: string;
  newEndTime?: string;
  newLocation?: string;
}) {
  const userId = await getCurrentUserId();
  const schedule = await prisma.classSchedule.findFirst({
    where: { id: data.classScheduleId, course: { semester: { OR: [{ userId }, { userId: null }] } } },
  });
  if (!schedule) {
    throw new UnauthorizedError("Class schedule not found or unauthorized");
  }

  const exception = await prisma.scheduleException.upsert({
    where: {
      classScheduleId_date: {
        classScheduleId: data.classScheduleId,
        date: new Date(data.date),
      },
    },
    create: {
      classScheduleId: data.classScheduleId,
      date: new Date(data.date),
      type: data.type,
      newStartTime: data.newStartTime || null,
      newEndTime: data.newEndTime || null,
      newLocation: data.newLocation || null,
    },
    update: {
      type: data.type,
      newStartTime: data.newStartTime || null,
      newEndTime: data.newEndTime || null,
      newLocation: data.newLocation || null,
    },
  });

  // Also mark attendance as cancelled if the class is cancelled
  if (data.type === "cancelled") {
    await prisma.attendanceRecord.upsert({
      where: {
        courseId_date: {
          courseId: schedule.courseId,
          date: new Date(data.date),
        },
      },
      create: {
        courseId: schedule.courseId,
        date: new Date(data.date),
        status: "cancelled",
      },
      update: { status: "cancelled" },
    });
  }

  revalidatePath(`/courses`);
  return exception;
}

export async function deleteScheduleException(id: string) {
  const userId = await getCurrentUserId();
  const exception = await prisma.scheduleException.findFirst({
    where: { id, classSchedule: { course: { semester: { OR: [{ userId }, { userId: null }] } } } },
    include: { classSchedule: { select: { courseId: true } } },
  });

  if (!exception) {
    throw new UnauthorizedError("Schedule exception not found or unauthorized");
  }

  // If it was a cancellation, restore attendance to not_marked
  if (exception.type === "cancelled") {
    await prisma.attendanceRecord.updateMany({
      where: {
        courseId: exception.classSchedule.courseId,
        date: exception.date,
        status: "cancelled",
      },
      data: { status: "not_marked" },
    });
  }

  await prisma.scheduleException.delete({ where: { id } });
  revalidatePath(`/courses`);
}

export async function getScheduleExceptions(classScheduleId: string) {
  const userId = await getCurrentUserId();
  return prisma.scheduleException.findMany({
    where: {
      classScheduleId,
      classSchedule: { course: { semester: { OR: [{ userId }, { userId: null }] } } },
    },
    orderBy: { date: "asc" },
  });
}
