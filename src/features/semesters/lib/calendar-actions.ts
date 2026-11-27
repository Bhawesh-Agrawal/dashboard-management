"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { ownerWhere } from "@/lib/owner-scoping";
import { parseDateOnly } from "@/lib/timezone";
import {
  ACADEMIC_CALENDAR_KINDS,
  defaultCancelsClassesForKind,
  type AcademicCalendarKindValue,
} from "./calendar-types";

const CalendarEntryInputSchema = z
  .object({
    semesterId: z.string().uuid(),
    kind: z.enum(ACADEMIC_CALENDAR_KINDS),
    title: z.string().trim().min(1).max(160),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    cancelsClasses: z.boolean().optional(),
    followsWeekday: z.number().int().min(1).max(7).nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .refine(
    (data) => !data.endDate || data.startDate <= data.endDate,
    { message: "End date must be on or after start date" }
  )
  .refine(
    (data) => data.kind !== "follows_weekday" || (data.followsWeekday !== null && data.followsWeekday !== undefined),
    { message: "followsWeekday (1–7) is required for follows_weekday entries" }
  );

async function assertSemesterOwned(userId: string, semesterId: string) {
  const sem = await prisma.semester.findFirst({
    where: { id: semesterId, ...ownerWhere(userId) },
    select: { id: true },
  });
  if (!sem) {
    throw new Error("Semester not found");
  }
  return sem;
}

export async function listAcademicCalendarEntries(semesterId: string) {
  const userId = await getCurrentUserId();
  await assertSemesterOwned(userId, semesterId);

  return prisma.academicCalendarEntry.findMany({
    where: { userId, semesterId },
    orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
  });
}

export async function createAcademicCalendarEntry(
  rawInput: z.infer<typeof CalendarEntryInputSchema>
) {
  const input = CalendarEntryInputSchema.parse(rawInput);
  const userId = await getCurrentUserId();
  await assertSemesterOwned(userId, input.semesterId);

  const startStr = input.startDate;
  const endStr = input.endDate ?? input.startDate;
  const cancelsClasses =
    input.cancelsClasses ?? defaultCancelsClassesForKind(input.kind);

  const entry = await prisma.academicCalendarEntry.create({
    data: {
      userId,
      semesterId: input.semesterId,
      kind: input.kind,
      title: input.title,
      startDate: parseDateOnly(startStr),
      endDate: parseDateOnly(endStr),
      cancelsClasses,
      followsWeekday: input.kind === "follows_weekday" ? input.followsWeekday ?? null : null,
      notes: input.notes ?? null,
    },
  });

  revalidatePath(`/semesters/${input.semesterId}`);
  revalidatePath(`/semesters/${input.semesterId}/calendar`);
  revalidatePath("/today");
  revalidatePath("/calendar");
  revalidatePath("/brief");
  return entry;
}

export async function bulkCreateAcademicCalendarEntries(
  semesterId: string,
  entries: Array<Omit<z.infer<typeof CalendarEntryInputSchema>, "semesterId">>
) {
  const userId = await getCurrentUserId();
  await assertSemesterOwned(userId, semesterId);

  const validated = entries.map((e) =>
    CalendarEntryInputSchema.parse({ ...e, semesterId })
  );

  if (validated.length === 0) return { created: 0 };

  await prisma.academicCalendarEntry.createMany({
    data: validated.map((item) => ({
      userId,
      semesterId,
      kind: item.kind,
      title: item.title,
      startDate: parseDateOnly(item.startDate),
      endDate: parseDateOnly(item.endDate ?? item.startDate),
      cancelsClasses: item.cancelsClasses ?? defaultCancelsClassesForKind(item.kind),
      followsWeekday: item.kind === "follows_weekday" ? item.followsWeekday ?? null : null,
      notes: item.notes ?? null,
    })),
  });

  revalidatePath(`/semesters/${semesterId}`);
  revalidatePath(`/semesters/${semesterId}/calendar`);
  revalidatePath("/today");
  revalidatePath("/calendar");
  revalidatePath("/brief");
  return { created: validated.length };
}

export async function updateAcademicCalendarEntry(
  id: string,
  rawInput: Partial<Omit<z.infer<typeof CalendarEntryInputSchema>, "semesterId">>
) {
  const userId = await getCurrentUserId();
  const existing = await prisma.academicCalendarEntry.findFirst({
    where: { id, userId },
  });
  if (!existing) {
    throw new Error("Calendar entry not found");
  }

  const nextKind = rawInput.kind ?? existing.kind;
  const nextStart =
    rawInput.startDate ?? existing.startDate.toISOString().slice(0, 10);
  const nextEnd =
    rawInput.endDate ?? existing.endDate.toISOString().slice(0, 10);

  if (nextStart > nextEnd) {
    throw new Error("End date must be on or after start date");
  }

  const nextFollows =
    nextKind === "follows_weekday"
      ? rawInput.followsWeekday !== undefined
        ? rawInput.followsWeekday
        : existing.followsWeekday
      : null;

  if (nextKind === "follows_weekday" && (nextFollows == null || nextFollows < 1 || nextFollows > 7)) {
    throw new Error("followsWeekday (1–7) is required for follows_weekday entries");
  }

  const updated = await prisma.academicCalendarEntry.update({
    where: { id },
    data: {
      kind: nextKind,
      title: rawInput.title?.trim() || existing.title,
      startDate: parseDateOnly(nextStart),
      endDate: parseDateOnly(nextEnd),
      cancelsClasses: rawInput.cancelsClasses ?? existing.cancelsClasses,
      followsWeekday: nextFollows,
      notes: rawInput.notes !== undefined ? rawInput.notes : existing.notes,
    },
  });

  revalidatePath(`/semesters/${existing.semesterId}`);
  revalidatePath(`/semesters/${existing.semesterId}/calendar`);
  revalidatePath("/today");
  revalidatePath("/calendar");
  revalidatePath("/brief");
  return updated;
}

export async function deleteAcademicCalendarEntry(id: string) {
  const userId = await getCurrentUserId();
  const existing = await prisma.academicCalendarEntry.findFirst({
    where: { id, userId },
    select: { id: true, semesterId: true },
  });
  if (!existing) {
    throw new Error("Calendar entry not found");
  }

  await prisma.academicCalendarEntry.delete({ where: { id } });

  revalidatePath(`/semesters/${existing.semesterId}`);
  revalidatePath(`/semesters/${existing.semesterId}/calendar`);
  revalidatePath("/today");
  revalidatePath("/calendar");
  revalidatePath("/brief");
  return { ok: true };
}
