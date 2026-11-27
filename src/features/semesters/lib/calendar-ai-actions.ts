"use server";

import { getCurrentUserId } from "@/lib/auth";
import { ownerWhere } from "@/lib/owner-scoping";
import { prisma } from "@/lib/prisma";
import { parseCalendarWithAI, type CalendarParseResult } from "./calendar-import";

export async function parseCalendarTextWithAiAction(
  semesterId: string,
  text: string
): Promise<CalendarParseResult> {
  const userId = await getCurrentUserId();
  const sem = await prisma.semester.findFirst({
    where: { id: semesterId, ...ownerWhere(userId) },
    select: { startDate: true },
  });
  if (!sem) {
    throw new Error("Semester not found");
  }

  return parseCalendarWithAI(text, {
    defaultYear: sem.startDate.getUTCFullYear(),
  });
}
