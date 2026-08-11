import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  fetchGoogleCalendarEvents,
  isGoogleCalendarConnected,
} from "@/features/calendar/lib/google-calendar";
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
      prisma.semester.findFirst({ where: { isActive: true } }),
      prisma.assessment.findMany({
        where: { date: { gte: startDate, lte: endDate } },
        include: { course: { select: { id: true, name: true, color: true } } },
      }),
      isGoogleCalendarConnected(userId),
    ]);

    // Fetch class schedules for the active semester
    let classSchedules: any[] = [];
    if (activeSemester) {
      classSchedules = await prisma.classSchedule.findMany({
        where: {
          course: { semesterId: activeSemester.id },
        },
        include: {
          course: { select: { id: true, name: true, color: true, code: true } },
        },
      });
    }

    // Google Calendar events
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
        time: event.start.toTimeString().slice(0, 5),
        endTime: event.end?.toTimeString().slice(0, 5),
        type: event.isBirthday ? "birthday" : "event",
        location: event.location ?? undefined,
        ...(event.isBirthday ? { courseName: "Birthday" } : {}),
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
    console.error("[Sync Calendar] Failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch calendar data" },
      { status: 500 }
    );
  }
}
