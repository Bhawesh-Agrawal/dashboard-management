import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, UnauthorizedError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  fetchGoogleCalendarEvents,
  isGoogleCalendarConnected,
} from "@/features/calendar/lib/google-calendar";
import { getCurrentSemester } from "@/features/semesters/lib/current";
import { getCalendarEntriesForSemester } from "@/features/semesters/lib/calendar-queries";
import { generateOccurrences } from "@/features/attendance/lib/occurrences";
import { formatDateOnly } from "@/lib/timezone";
import type { CalendarEvent } from "@/types";

interface CalendarRequest {
  tasks: {
    id: string;
    title: string;
    dueDate: string | null;
    courseId: string | null;
    courseName: string | null;
    courseColor: string | null;
  }[];
  events: {
    id: string;
    title: string;
    dateTime: string;
    location: string | null;
    eventType: string | null;
  }[];
}

/**
 * Merges Dexie-sourced tasks/events with server-only data
 * (class schedules, assessments, Google Calendar) into unified CalendarEvent[].
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const { searchParams } = new URL(request.url);
    const startDate = new Date(searchParams.get("start") || new Date().toISOString());
    const endDate = new Date(searchParams.get("end") || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString());

    const body: CalendarRequest = await request.json();
    const { tasks: dexieTasks, events: dexieEvents } = body;

    // Fetch server-only data in parallel
    const [activeSemester, assessments, googleConnected] = await Promise.all([
      getCurrentSemester(userId),
      prisma.assessment.findMany({
        where: { date: { gte: startDate, lte: endDate } },
        include: { course: { select: { id: true, name: true, color: true } } },
      }),
      isGoogleCalendarConnected(userId),
    ]);

    // Fetch class schedules and academic calendar entries for the active semester
    let classSchedules: Array<{
      id: string;
      courseId: string;
      dayOfWeek: "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";
      startTime: string;
      endTime: string;
      location: string | null;
      effectiveStartDate: Date | null;
      effectiveEndDate: Date | null;
      course: { id: string; name: string; color: string | null; code: string | null };
      exceptions: Array<{
        id: string;
        classScheduleId: string;
        date: Date;
        type: "cancelled" | "rescheduled";
        newStartTime: string | null;
        newEndTime: string | null;
        newLocation: string | null;
      }>;
    }> = [];
    let calendarEntries: Awaited<ReturnType<typeof getCalendarEntriesForSemester>> = [];
    if (activeSemester) {
      [classSchedules, calendarEntries] = await Promise.all([
        prisma.classSchedule.findMany({
          where: {
            course: { semesterId: activeSemester.id },
          },
          include: {
            course: { select: { id: true, name: true, color: true, code: true } },
            exceptions: {
              where: { date: { gte: startDate, lte: endDate } },
            },
          },
        }),
        getCalendarEntriesForSemester(userId, activeSemester.id),
      ]);
    }

    // Google Calendar events
    let googleEvents: Awaited<ReturnType<typeof fetchGoogleCalendarEvents>> = [];
    if (googleConnected) {
      googleEvents = await fetchGoogleCalendarEvents(startDate, endDate, userId);
    }

    const calendarEvents: CalendarEvent[] = [];

    // Expand recurring class schedules via the pure Occurrence Engine
    if (activeSemester && classSchedules.length > 0) {
      const scheduleMap = new Map(classSchedules.map((s) => [s.id, s]));
      const occurrences = generateOccurrences({
        schedules: classSchedules,
        exceptions: classSchedules.flatMap((s) => s.exceptions),
        calendarEntries,
        semesterId: activeSemester.id,
        semesterStartDate: activeSemester.startDate,
        semesterEndDate: activeSemester.endDate,
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
    const typeLabels: Record<string, string> = {
      minor_assignment: "Minor/Assignment",
      mid_sem: "Mid-Sem",
      end_sem: "End-Sem",
      attendance: "Attendance",
    };
    for (const assessment of assessments) {
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

    // Add tasks from Dexie
    for (const task of dexieTasks) {
      if (task.dueDate) {
        calendarEvents.push({
          id: `task-${task.id}`,
          title: task.title,
          date: task.dueDate,
          type: "task",
          courseId: task.courseId || undefined,
          courseName: task.courseName || undefined,
          courseColor: task.courseColor || undefined,
        });
      }
    }

    // Add events from Dexie
    for (const event of dexieEvents) {
      calendarEvents.push({
        id: `event-${event.id}`,
        title: event.title,
        date: event.dateTime,
        time: new Date(event.dateTime).toTimeString().slice(0, 5),
        type: "event",
        location: event.location ?? undefined,
      });
    }

    // Add Google Calendar events
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

    // Sort by date then time
    calendarEvents.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return (a.time || "").localeCompare(b.time || "");
    });

    return NextResponse.json({ events: calendarEvents });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[Sync Calendar] Failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch calendar data" },
      { status: 500 }
    );
  }
}
