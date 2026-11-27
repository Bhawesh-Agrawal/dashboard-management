"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/auth";
import { ownerWhere } from "@/lib/owner-scoping";
import { prisma } from "@/lib/prisma";
import { formatDateOnly } from "@/lib/timezone";
import {
  detectRepeatedCancelledDates,
  type RepeatedHolidayCandidate,
} from "./exception-migration";

function parseUtcDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

export async function previewRepeatedHolidaysAction(
  semesterId: string
): Promise<RepeatedHolidayCandidate[]> {
  const userId = await getCurrentUserId();
  const sem = await prisma.semester.findFirst({
    where: { id: semesterId, ...ownerWhere(userId) },
    select: { id: true },
  });
  if (!sem) {
    throw new Error("Semester not found");
  }

  const [schedules, existingEntries] = await Promise.all([
    prisma.classSchedule.findMany({
      where: { course: { semesterId } },
      select: {
        id: true,
        dayOfWeek: true,
        exceptions: {
          where: { type: "cancelled" },
          select: { id: true, date: true, type: true },
        },
      },
    }),
    prisma.academicCalendarEntry.findMany({
      where: { semesterId, userId, cancelsClasses: true },
      select: { startDate: true, endDate: true },
    }),
  ]);

  const candidates = detectRepeatedCancelledDates(schedules);
  const coveredRanges = existingEntries.map((e) => ({
    start: formatDateOnly(e.startDate),
    end: formatDateOnly(e.endDate),
  }));

  return candidates.filter(
    (c) => !coveredRanges.some((r) => c.date >= r.start && c.date <= r.end)
  );
}

export async function convertRepeatedHolidaysAction(input: {
  semesterId: string;
  items: Array<{ date: string; title: string; exceptionIds: string[] }>;
}): Promise<{ createdEntries: number; removedExceptions: number }> {
  const userId = await getCurrentUserId();
  const sem = await prisma.semester.findFirst({
    where: { id: input.semesterId, ...ownerWhere(userId) },
    select: { id: true },
  });
  if (!sem) {
    throw new Error("Semester not found");
  }

  if (input.items.length === 0) {
    return { createdEntries: 0, removedExceptions: 0 };
  }

  const allExceptionIds = input.items.flatMap((i) => i.exceptionIds);

  const result = await prisma.$transaction(async (tx) => {
    const created = await tx.academicCalendarEntry.createMany({
      data: input.items.map((item) => ({
        userId,
        semesterId: input.semesterId,
        kind: "holiday" as const,
        title: item.title.trim() || "Holiday",
        startDate: parseUtcDate(item.date),
        endDate: parseUtcDate(item.date),
        cancelsClasses: true,
      })),
    });

    const deleted = await tx.scheduleException.deleteMany({
      where: {
        id: { in: allExceptionIds },
        classSchedule: {
          course: {
            semester: { id: input.semesterId, ...ownerWhere(userId) },
          },
        },
      },
    });

    return {
      createdEntries: created.count,
      removedExceptions: deleted.count,
    };
  });

  revalidatePath(`/semesters/${input.semesterId}`);
  revalidatePath(`/semesters/${input.semesterId}/calendar`);
  revalidatePath("/today");
  revalidatePath("/calendar");
  revalidatePath("/brief");

  return result;
}
