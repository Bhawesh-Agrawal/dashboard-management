"use server";

import type { DayOfWeek } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/auth";
import { ownerWhere } from "@/lib/owner-scoping";
import { prisma } from "@/lib/prisma";
import { parseTimetableWithAI, type TimetableParseResult } from "./timetable-import";
import { hmToMinutes } from "./timetable-utils";

export async function parseTimetableWithAiAction(
  semesterId: string,
  text: string
): Promise<TimetableParseResult> {
  const userId = await getCurrentUserId();
  const sem = await prisma.semester.findFirst({
    where: { id: semesterId, ...ownerWhere(userId) },
    select: { id: true },
  });
  if (!sem) {
    throw new Error("Semester not found");
  }
  return parseTimetableWithAI(text);
}

export interface ConfirmTimetableRowInput {
  courseName: string;
  courseCode?: string | null;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  location?: string | null;
  matchedCourseId?: string | null;
}

export async function confirmTimetableImportAction(input: {
  semesterId: string;
  rows: ConfirmTimetableRowInput[];
}): Promise<{ createdSlots: number; createdCourses: number }> {
  const userId = await getCurrentUserId();
  const semester = await prisma.semester.findFirst({
    where: { id: input.semesterId, ...ownerWhere(userId) },
    include: { courses: true },
  });
  if (!semester) {
    throw new Error("Semester not found");
  }

  const courseById = new Map(semester.courses.map((c) => [c.id, c]));
  const courseByKey = new Map<string, (typeof semester.courses)[number]>();
  for (const c of semester.courses) {
    courseByKey.set(c.name.trim().toLowerCase(), c);
    if (c.code) courseByKey.set(c.code.trim().toLowerCase(), c);
  }

  let createdCourses = 0;
  const toInsert: Array<{
    courseId: string;
    dayOfWeek: DayOfWeek;
    startTime: string;
    endTime: string;
    location: string | null;
    endDate: Date;
  }> = [];

  for (const row of input.rows) {
    const sMin = hmToMinutes(row.startTime);
    const eMin = hmToMinutes(row.endTime);
    if (sMin === null || eMin === null || sMin >= eMin) {
      throw new Error(`Invalid time range ${row.startTime}-${row.endTime}`);
    }

    let courseId =
      row.matchedCourseId && courseById.has(row.matchedCourseId)
        ? row.matchedCourseId
        : null;

    if (!courseId) {
      const nameKey = row.courseName.trim().toLowerCase();
      const codeKey = row.courseCode?.trim().toLowerCase();
      const existing =
        (codeKey ? courseByKey.get(codeKey) : undefined) ?? courseByKey.get(nameKey);

      if (existing) {
        courseId = existing.id;
      } else {
        const created = await prisma.course.create({
          data: {
            semesterId: semester.id,
            name: row.courseName.trim(),
            code: row.courseCode?.trim() || null,
            credits: 3,
          },
        });
        createdCourses += 1;
        courseById.set(created.id, created);
        courseByKey.set(created.name.trim().toLowerCase(), created);
        if (created.code) courseByKey.set(created.code.trim().toLowerCase(), created);
        courseId = created.id;
      }
    }

    toInsert.push({
      courseId,
      dayOfWeek: row.dayOfWeek,
      startTime: row.startTime,
      endTime: row.endTime,
      location: row.location?.trim() || null,
      endDate: semester.endDate,
    });
  }

  if (toInsert.length > 0) {
    await prisma.classSchedule.createMany({ data: toInsert });
  }

  revalidatePath(`/semesters/${input.semesterId}`);
  revalidatePath(`/semesters/${input.semesterId}/timetable`);
  revalidatePath("/courses");
  revalidatePath("/today");
  revalidatePath("/calendar");
  revalidatePath("/brief");

  return { createdSlots: toInsert.length, createdCourses };
}
