"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createClassSchedule(data: {
  courseId: string;
  dayOfWeek: "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";
  startTime: string;
  endTime: string;
  location?: string;
  effectiveStartDate?: string;
  effectiveEndDate?: string;
}) {
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
    const schedule = await prisma.classSchedule.findUnique({
      where: { id: data.classScheduleId },
      select: { courseId: true },
    });
    if (schedule) {
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
  }

  revalidatePath(`/courses`);
  return exception;
}

export async function deleteScheduleException(id: string) {
  const exception = await prisma.scheduleException.findUnique({
    where: { id },
    include: { classSchedule: { select: { courseId: true } } },
  });

  if (exception) {
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
}

export async function getScheduleExceptions(classScheduleId: string) {
  return prisma.scheduleException.findMany({
    where: { classScheduleId },
    orderBy: { date: "asc" },
  });
}
