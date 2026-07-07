import { prisma } from "@/lib/prisma";
import { cache } from "react";
import type { DashboardData, TaskWithCourse } from "@/types";
import {
  computeSGPA,
  computeCGPA,
  computeAttendancePercent,
} from "@/features/assessments/lib/calculations";
import { computeCourseGrade } from "@/features/assessments/lib/queries";
import { getRoutinesWithStreaks } from "@/features/routines/lib/completions";
import { computeProjectProgress } from "@/features/projects/lib/utils";
import { computeActivityStreak } from "@/features/routines/lib/streaks";
import { getOpenTasks } from "@/features/tasks/lib/queries";
import {
  fetchGoogleCalendarEvents,
  isGoogleCalendarConnected,
} from "@/features/calendar/lib/google-calendar";
import { createClient } from "@/features/auth/lib/supabase-server";

async function getCurrentUserId(): Promise<string> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id || "default-user";
  } catch {
    return "default-user";
  }
}

/**
 * Aggregate all data needed for the /today dashboard.
 */
export const getDashboardData = cache(async (): Promise<DashboardData> => {
  const activeSemester = await prisma.semester.findFirst({
    where: { isActive: true },
    include: { courses: true },
  });

  const today = new Date();
  const dayOfWeekMap: Record<string, string> = {
    0: "SUN", 1: "MON", 2: "TUE", 3: "WED", 4: "THU", 5: "FRI", 6: "SAT",
  };
  const todayDayOfWeek = dayOfWeekMap[today.getDay()];

  // Tomorrow's day-of-week for routines preview
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDayOfWeek = dayOfWeekMap[tomorrow.getDay()];

  // ─── Top 3 starred tasks ─────────────────────────────────
  const topTasks: TaskWithCourse[] = await prisma.task.findMany({
    where: { starred: true, status: "open" },
    orderBy: [{ priority: "asc" }, { dueDate: "asc" }],
    take: 3,
    include: {
      course: { select: { id: true, name: true, color: true } },
      project: { select: { id: true, name: true, color: true } },
    },
  });

  // ─── All open tasks (for quick star-to-prioritize) ──────
  const allOpenTasks: TaskWithCourse[] = (await getOpenTasks()).slice(0, 10);

  // ─── Today's classes ─────────────────────────────────────
  const todayClasses = activeSemester
    ? await prisma.classSchedule.findMany({
        where: {
          dayOfWeek: todayDayOfWeek as "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN",
          course: { semesterId: activeSemester.id },
        },
        orderBy: { startTime: "asc" },
        include: {
          course: { select: { id: true, name: true, color: true, code: true } },
        },
      })
    : [];

  // ─── Upcoming events & birthdays (7-day window) ─────────
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + 7);

  const userId = await getCurrentUserId();
  const googleConnected = await isGoogleCalendarConnected(userId);

  const [upcomingEvents, birthdayEvents, peopleWithBirthdays, googleEvents] = await Promise.all([
    prisma.event.findMany({
      where: {
        dateTime: { gte: today, lte: windowEnd },
        eventType: { not: "birthday" },
      },
      orderBy: { dateTime: "asc" },
    }),
    // Birthday events from local Event table (if any were manually created)
    prisma.event.findMany({
      where: {
        dateTime: { gte: today, lte: windowEnd },
        eventType: "birthday",
      },
      orderBy: { dateTime: "asc" },
    }),
    // Person records as fallback
    prisma.person.findMany({
      where: { birthday: { not: null } },
      select: { id: true, name: true, birthday: true },
    }),
    // Google Calendar events (includes birthdays from the Birthdays calendar)
    googleConnected
      ? fetchGoogleCalendarEvents(today, windowEnd, userId)
      : Promise.resolve([]),
  ]);

  // Build birthday list: Google Calendar birthdays first, then local, then Person fallback
  const upcomingBirthdays: DashboardData["upcomingDeadlines"] = [];
  const seenBirthdayNames = new Set<string>();

  // 1. Google Calendar-sourced birthdays (primary source)
  for (const event of googleEvents) {
    if (event.isBirthday) {
      const lowerTitle = event.title.toLowerCase();
      upcomingBirthdays.push({
        id: `google-${event.id}`,
        title: event.title,
        date: event.start,
        type: "birthday" as const,
        linkTo: "/calendar",
      });
      seenBirthdayNames.add(lowerTitle);
    }
  }

  // 2. Local Event table birthdays
  for (const event of birthdayEvents) {
    const lowerTitle = event.title.toLowerCase();
    if (!seenBirthdayNames.has(lowerTitle)) {
      upcomingBirthdays.push({
        id: event.id,
        title: event.title,
        date: event.dateTime,
        type: "birthday" as const,
        linkTo: "/calendar",
      });
      seenBirthdayNames.add(lowerTitle);
    }
  }

  // 3. Person-sourced birthdays (only if not already covered by Calendar)
  for (const person of peopleWithBirthdays) {
    if (!person.birthday) continue;
    const bday = new Date(today.getFullYear(), person.birthday.getMonth(), person.birthday.getDate());
    if (bday < today) bday.setFullYear(today.getFullYear() + 1);
    const diffMs = bday.getTime() - today.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays >= 0 && diffDays <= 7) {
      const alreadyCovered = [...seenBirthdayNames].some((name) =>
        name.includes(person.name.toLowerCase()) || person.name.toLowerCase().includes(name.replace("'s birthday", ""))
      );
      if (!alreadyCovered) {
        upcomingBirthdays.push({
          id: `birthday-${person.id}`,
          title: `${person.name}'s birthday`,
          date: bday,
          type: "birthday" as const,
          personId: person.id,
          personName: person.name,
          linkTo: `/people/${person.id}`,
        });
      }
    }
  }

  const upcomingDeadlines: DashboardData["upcomingDeadlines"] = [
    ...upcomingEvents.map((e) => ({
      id: e.id,
      title: e.title,
      date: e.dateTime,
      type: "event" as const,
      linkTo: "/calendar",
    })),
    ...upcomingBirthdays,
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  // ─── Attendance alerts (courses below 75%) ──────────────
  const attendanceAlerts: DashboardData["attendanceAlerts"] = [];
  if (activeSemester) {
    const courses = await prisma.course.findMany({
      where: { semesterId: activeSemester.id },
      include: { attendanceRecords: true },
    });

    for (const course of courses) {
      const present = course.attendanceRecords.filter((r) => r.status === "present").length;
      const absent = course.attendanceRecords.filter((r) => r.status === "absent").length;
      const percent = computeAttendancePercent(present, absent);

      if (percent < 75 && (present + absent) > 0) {
        attendanceAlerts.push({
          courseId: course.id,
          courseName: course.name,
          courseColor: course.color,
          attendancePercent: Math.round(percent * 10) / 10,
        });
      }
    }
  }

  // ─── Routines for today with streaks ────────────────────
  const routines = await getRoutinesWithStreaks();

  // ─── Tomorrow's routines (preview, no streaks needed) ───
  const tomorrowRoutines = await prisma.routine.findMany({
    where: {
      activeDays: { has: tomorrowDayOfWeek as "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN" },
    },
    select: { id: true, name: true, specificTime: true },
  });

  // ─── Streak / contribution data (last 180 days) ────────
  const streakData = await computeActivityStreak(180);

  // ─── Daily quotes (all quotes for deterministic pick) ───
  const quotes = await prisma.quote.findMany({
    select: { id: true, text: true, source: true },
  });

  // ─── Active projects with progress ──────────────────────
  const activeProjectsRaw = await prisma.project.findMany({
    where: { status: { notIn: ["completed", "archived"] } },
    include: { milestones: { select: { isDone: true, weight: true } } },
    take: 5,
    orderBy: { updatedAt: "desc" },
  });

  const activeProjects = activeProjectsRaw.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    progress: computeProjectProgress(p.milestones),
  }));

  // ─── SGPA / CGPA ────────────────────────────────────────
  let sgpa: number | null = null;
  let cgpa: number | null = null;

  if (activeSemester) {
    const courses = await prisma.course.findMany({
      where: { semesterId: activeSemester.id },
    });

    const courseGrades = await Promise.all(
      courses.map((course) => computeCourseGrade(course))
    );
    sgpa = computeSGPA(courseGrades);

    const allSemesters = await prisma.semester.findMany({
      orderBy: { startDate: "asc" },
    });

    const semData = await Promise.all(
      allSemesters.map(async (sem) => {
        const semCourses = await prisma.course.findMany({
          where: { semesterId: sem.id },
        });
        const totalCredits = semCourses.reduce((sum, c) => sum + c.credits, 0);

        if (sem.id === activeSemester.id) {
          return { sgpa, totalCredits };
        }

        const grades = await Promise.all(
          semCourses.map((course) => computeCourseGrade(course))
        );
        return { sgpa: computeSGPA(grades), totalCredits };
      })
    );

    cgpa = computeCGPA(semData);
  }

  return {
    topTasks,
    allOpenTasks,
    todayClasses,
    upcomingDeadlines,
    attendanceAlerts,
    routines,
    tomorrowRoutines,
    streakData,
    quotes,
    activeProjects,
    sgpa,
    cgpa,
  };
});
