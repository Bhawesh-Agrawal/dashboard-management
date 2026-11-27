import { prisma } from "@/lib/prisma";
import { formatDateOnly, parseDateOnly } from "@/lib/timezone";
import type { OccurrenceCalendarEntry } from "@/features/attendance/lib/occurrences";
import {
  entriesForDate,
  type AcademicCalendarEntryItem,
} from "./academic-calendar-dates";

export { entriesForDate, type AcademicCalendarEntryItem };

/**
 * Safely load academic calendar entries for a semester.
 * Returns [] if the table is unavailable or unmigrated in unit test mocks.
 */
export async function getCalendarEntriesForSemester(
  userId: string,
  semesterId: string
): Promise<OccurrenceCalendarEntry[]> {
  try {
    const rows = await prisma.academicCalendarEntry.findMany({
      where: { userId, semesterId },
      orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
    });
    return rows.map((r) => ({
      id: r.id,
      semesterId: r.semesterId,
      kind: r.kind,
      title: r.title,
      startDate: r.startDate,
      endDate: r.endDate,
      cancelsClasses: r.cancelsClasses,
      followsWeekday: r.followsWeekday,
    }));
  } catch {
    return [];
  }
}

/**
 * Single source of truth for loading AcademicCalendarEntry rows overlapping
 * [start, end] across ALL semesters (past, active, upcoming) owned by `userId`.
 */
export async function getAcademicEntriesForRange(
  userId: string,
  start: Date | string,
  end: Date | string
): Promise<AcademicCalendarEntryItem[]> {
  const startDate = parseDateOnly(formatDateOnly(start));
  const endDate = parseDateOnly(formatDateOnly(end));

  try {
    const rows = await prisma.academicCalendarEntry.findMany({
      where: {
        userId,
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      include: {
        semester: { select: { name: true } },
      },
      orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
    });

    return rows.map((r) => ({
      id: r.id,
      semesterId: r.semesterId,
      semesterName: r.semester?.name,
      kind: r.kind,
      title: r.title,
      startDate: formatDateOnly(r.startDate),
      endDate: formatDateOnly(r.endDate),
      cancelsClasses: r.cancelsClasses,
      followsWeekday: r.followsWeekday,
      notes: r.notes,
    }));
  } catch {
    return [];
  }
}
