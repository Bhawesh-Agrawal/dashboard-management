import { prisma } from "@/lib/prisma";
import type { CalendarEvent } from "@/types";
import { fetchGoogleCalendarEvents, isGoogleCalendarConnected } from "./google-calendar";
import { getCurrentUserId } from "@/lib/auth";

/**
 * Merge class schedules, assessments, tasks, events, and (optionally) Google Calendar events
 * into a unified calendar view.
 */
export async function getCalendarEvents(startDate: Date, endDate: Date) {
  const userId = await getCurrentUserId();
  const [classSchedules, assessments, tasks, events, googleConnected] = await Promise.all([
    prisma.classSchedule.findMany({
      include: { course: { select: { id: true, name: true, color: true, code: true } } },
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
  ]);

  // Fetch Google Calendar events if connected
  let googleEvents: Awaited<ReturnType<typeof fetchGoogleCalendarEvents>> = [];
  if (googleConnected) {
    googleEvents = await fetchGoogleCalendarEvents(startDate, endDate, userId);
  }

  const calendarEvents: CalendarEvent[] = [];

  // Expand recurring class schedules into actual dates within the range
  for (const schedule of classSchedules) {
    const dayMap: Record<string, number> = {
      MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6, SUN: 0,
    };
    const targetDay = dayMap[schedule.dayOfWeek];

    // Iterate through each day in the range
    const current = new Date(startDate);
    while (current <= endDate) {
      if (current.getDay() === targetDay) {
        calendarEvents.push({
          id: `schedule-${schedule.id}-${current.toISOString().slice(0, 10)}`,
          title: schedule.course.name,
          date: current.toISOString(),
          time: schedule.startTime,
          endTime: schedule.endTime,
          type: "class",
          courseId: schedule.course.id,
          courseName: schedule.course.code || schedule.course.name,
          courseColor: schedule.course.color ?? undefined,
          location: schedule.location ?? undefined,
        });
      }
      current.setDate(current.getDate() + 1);
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
      time: event.start.toTimeString().slice(0, 5),
      endTime: event.end?.toTimeString().slice(0, 5),
      type: event.isBirthday ? "event" : "event",
      location: event.location ?? undefined,
      // Tag birthday events so the UI can render them distinctly
      ...(event.isBirthday ? { courseName: "🎂 Birthday" } : {}),
    });
  }

  // Sort by date then time
  calendarEvents.sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    return (a.time || "").localeCompare(b.time || "");
  });

  return calendarEvents;
}
