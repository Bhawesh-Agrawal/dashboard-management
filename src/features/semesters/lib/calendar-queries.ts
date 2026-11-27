import { prisma } from "@/lib/prisma";
import type { OccurrenceCalendarEntry } from "@/features/attendance/lib/occurrences";

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
