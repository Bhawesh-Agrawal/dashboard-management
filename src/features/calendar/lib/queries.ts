import { prisma } from "@/lib/prisma";
import type { CalendarEvent } from "@/types";
import { fetchGoogleCalendarEvents, isGoogleCalendarConnected } from "./google-calendar";
import { getCurrentUserId } from "@/lib/auth";
import { generateOccurrences } from "@/features/attendance/lib/occurrences";
import { getAcademicEntriesForRange } from "@/features/semesters/lib/calendar-queries";
import { formatDateOnly } from "@/lib/timezone";

/**
 * Merge class schedules, assessments, tasks, events, and (optionally) Google Calendar events
 * into a unified calendar view.
 */
export async function getCalendarEvents(startDate: Date, endDate: Date) {
  const userId = await getCurrentUserId();
  const [classSchedules, assessments, tasks, events, googleConnected, calendarEntries] = await Promise.all([
    prisma.classSchedule.findMany({
      include: {
        course: { select: { id: true, name: true, color: true, code: true, semesterId: true, semester: { select: { startDate: true, endDate: true } } } },
        exceptions: { where: { date: { gte: startDate, lte: endDate } } },
      },
    }),
    prisma.assessment.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
      },
      include: { course: { select: { id: true, name: true, color: true } } },
    }),
    prisma.task.findMany({
      where: {
        dueDate: { gte: startDate, lte: endDate },
        status: "open",
        OR: [{ userId }, { userId: null }],
      },
      include: { course: { select: { id: true, name: true, color: true } } },
    }),
    prisma.event.findMany({
      where: {
        dateTime: { gte: startDate, lte: endDate },
      },
    }),
    isGoogleCalendarConnected(userId),
    getAcademicEntriesForRange(userId, startDate, endDate),
  ]);

  // Fetch Google Calendar events if connected
  let googleEvents: Awaited<ReturnType<typeof fetchGoogleCalendarEvents>> = [];
  if (googleConnected) {
    googleEvents = await fetchGoogleCalendarEvents(startDate, endDate, userId);
  }

  const calendarEvents: CalendarEvent[] = [];

  // Expand recurring class schedules via the pure Occurrence Engine
  if (classSchedules.length > 0) {
    const scheduleMap = new Map(classSchedules.map((s) => [s.id, s]));
    const firstSem = classSchedules[0]?.course.semester;
    const occurrences = generateOccurrences({
      schedules: classSchedules,
      exceptions: classSchedules.flatMap((s) => s.exceptions),
      calendarEntries,
      semesterStartDate: firstSem?.startDate,
      semesterEndDate: firstSem?.endDate,
      startDate: formatDateOnly(startDate),
      endDate: formatDateOnly(endDate),
    });

    for (const occ of occurrences) {
      if (occ.status === "cancelled") continue;
      const schedule = scheduleMap.get(occ.classScheduleId);
      if (!schedule) continue;
      calendarEvents.push({
        id: `schedule-${schedule.id}-${occ.date}`,
        title: schedule.course.name,
        date: `${occ.date}T00:00:00.000Z`,
        time: occ.startTime,
        endTime: occ.endTime,
        type: "class",
        courseId: schedule.course.id,
        courseName: schedule.course.code || schedule.course.name,
        courseColor: schedule.course.color ?? undefined,
        location: occ.location ?? undefined,
      });
    }
  }

  // Add assessments
  for (const assessment of assessments) {
    const typeLabels: Record<string, string> = {
      minor_assignment: "Minor/Assignment",
      mid_sem: "Mid-Sem",
      end_sem: "End-Sem",
      attendance: "Attendance",
    };
        calendarEvents.push({
          id: `assessment-${assessment.id}`,
          title: `${typeLabels[assessment.componentType]} — ${assessment.course.name}`,
          date: assessment.date!.toISOString(),
          type: "assessment",
          courseId: assessment.course.id,
          courseName: assessment.course.name,
          courseColor: assessment.course.color ?? undefined,
        });
  }

  // Add tasks
  for (const task of tasks) {
    calendarEvents.push({
      id: `task-${task.id}`,
      title: task.title,
      date: task.dueDate!.toISOString(),
      type: "task",
      courseId: task.courseId || undefined,
      courseName: task.course?.name,
      courseColor: task.course?.color || undefined,
    });
  }

  // Add events
  for (const event of events) {
    calendarEvents.push({
      id: `event-${event.id}`,
      title: event.title,
      date: event.dateTime.toISOString(),
      time: event.dateTime.toTimeString().slice(0, 5),
      type: "event",
      location: event.location ?? undefined,
    });
  }

  // Add Google Calendar events (read-only, with source tag)
  for (const event of googleEvents) {
    calendarEvents.push({
      id: `google-${event.id}`,
      title: event.title,
      date: event.start.toISOString(),
      time: event.isAllDay ? undefined : event.start.toTimeString().slice(0, 5),
      endTime: event.isAllDay ? undefined : event.end?.toTimeString().slice(0, 5),
      type: event.isBirthday ? "birthday" : "event",
      location: event.location ?? undefined,
      courseName: event.isBirthday ? "Birthday" : event.calendarName,
      courseColor: event.isBirthday ? undefined : event.calendarColor ?? undefined,
    });
  }

  // Sort by date then time, with today's events first
  const todayStr = new Date().toISOString().slice(0, 10);
  calendarEvents.sort((a, b) => {
    const aDate = a.date.slice(0, 10);
    const bDate = b.date.slice(0, 10);
    const aIsTodayOrFuture = aDate >= todayStr;
    const bIsTodayOrFuture = bDate >= todayStr;
    if (aIsTodayOrFuture !== bIsTodayOrFuture) return aIsTodayOrFuture ? -1 : 1;
    const dateCompare = aDate.localeCompare(bDate);
    if (dateCompare !== 0) return dateCompare;
    return (a.time || "").localeCompare(b.time || "");
  });

  return calendarEvents;
}
