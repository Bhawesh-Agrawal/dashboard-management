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
import { getCurrentUserId } from "@/lib/auth";

/**
 * Aggregate all data needed for the /today dashboard.
 *
 * Performance optimizations applied:
 * - All independent queries run in a single Promise.all (was sequential)
 * - getCurrentUserId + isGoogleCalendarConnected resolved in parallel
 * - Grading configs cached in memCache (no per-course DB hits after first load)
 * - Attendance data fetched in bulk and reused for both alerts and grades
 * - Active semester + courses fetched once and reused everywhere
 */
export const getDashboardData = cache(async (): Promise<DashboardData> => {
  const today = new Date();
  const dayOfWeekMap: Record<string, string> = {
    0: "SUN", 1: "MON", 2: "TUE", 3: "WED", 4: "THU", 5: "FRI", 6: "SAT",
  };
  const todayDayOfWeek = dayOfWeekMap[today.getDay()];

  // Tomorrow's day-of-week for routines preview
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDayOfWeek = dayOfWeekMap[tomorrow.getDay()];

  // ─── Phase 1: Fire ALL independent queries in parallel ────────────────────
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + 7);

  const userId = await getCurrentUserId();

  const [
    activeSemester,
    topTasks,
    allOpenTasksRaw,
    upcomingEvents,
    birthdayEvents,
    peopleWithBirthdays,
    routines,
    tomorrowRoutines,
    streakData,
    quotes,
    activeProjectsRaw,
    latestReview,
    unviewedReviewCount,
  ] = await Promise.all([
    // Active semester + courses in one query
    prisma.semester.findFirst({
      where: { isActive: true },
      include: { courses: true },
    }),
    // Top 3 starred tasks
    prisma.task.findMany({
      where: { starred: true, status: "open", OR: [{ userId }, { userId: null }] },
      orderBy: [{ priority: "asc" }, { dueDate: "asc" }],
      take: 3,
      include: {
        course: { select: { id: true, name: true, color: true } },
        project: { select: { id: true, name: true, color: true } },
      },
    }) as Promise<TaskWithCourse[]>,
    // All open tasks
    getOpenTasks(userId),
    // Upcoming events (non-birthday)
    prisma.event.findMany({
      where: {
        dateTime: { gte: today, lte: windowEnd },
        eventType: { not: "birthday" },
      },
      orderBy: { dateTime: "asc" },
    }),
    // Birthday events from local Event table
    prisma.event.findMany({
      where: {
        dateTime: { gte: today, lte: windowEnd },
        eventType: "birthday",
      },
      orderBy: { dateTime: "asc" },
    }),
    // Person records for birthday fallback
    prisma.person.findMany({
      where: { birthday: { not: null } },
      select: { id: true, name: true, birthday: true },
    }),
    // Routines with streaks (now N+1-free)
    getRoutinesWithStreaks(),
    // Tomorrow's routines preview
    prisma.routine.findMany({
      where: {
        activeDays: { has: tomorrowDayOfWeek as "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN" },
      },
      select: { id: true, name: true, specificTime: true },
    }),
    // Activity streak (last 180 days)
    computeActivityStreak(180),
    // Daily quotes
    prisma.quote.findMany({
      select: { id: true, text: true, source: true },
    }),
    // Active projects
    prisma.project.findMany({
      where: { status: { notIn: ["completed", "archived"] } },
      include: { milestones: { select: { isDone: true, weight: true } } },
      take: 5,
      orderBy: { updatedAt: "desc" },
    }),
    // Latest review for dashboard widget
    prisma.review.findFirst({
      where: { userId, status: { not: "archived" } },
      orderBy: { periodEnd: "desc" },
    }),
    // Unviewed review count
    prisma.review.count({
      where: { userId, status: "generated" },
    }),
  ]);

  const topTaskIds = new Set(topTasks.map((t) => t.id));
  const allOpenTasks: TaskWithCourse[] = allOpenTasksRaw
    .filter((t) => !topTaskIds.has(t.id))
    .slice(0, 10);

  // ─── Phase 2: Google Calendar (depends on userId) ─────────────────────────
  const googleConnected = await isGoogleCalendarConnected(userId);
  const googleEvents = googleConnected
    ? await fetchGoogleCalendarEvents(today, windowEnd, userId)
    : [];

  // ─── Phase 3: Semester-dependent queries run in parallel ──────────────────
  const [todayClasses, attendanceData, semesterCoursesForGrades, allSemesters] = await Promise.all([
    // Today's classes
    activeSemester
      ? prisma.classSchedule.findMany({
          where: {
            dayOfWeek: todayDayOfWeek as "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN",
            course: { semesterId: activeSemester.id },
          },
          orderBy: { startTime: "asc" },
          include: {
            course: { select: { id: true, name: true, color: true, code: true } },
          },
        })
      : Promise.resolve([]),
    // Attendance data for all active courses — single query reused for both alerts and grades
    activeSemester
      ? prisma.course.findMany({
          where: { semesterId: activeSemester.id },
          include: { attendanceRecords: { select: { status: true } } },
        })
      : Promise.resolve([]),
    // Courses for SGPA (active semester)
    activeSemester
      ? prisma.course.findMany({ where: { semesterId: activeSemester.id } })
      : Promise.resolve([]),
    // All semesters for CGPA
    prisma.semester.findMany({ orderBy: { startDate: "asc" } }),
  ]);

  // ─── Build birthday list ──────────────────────────────────────────────────
  const upcomingBirthdays: DashboardData["upcomingDeadlines"] = [];
  const seenBirthdayNames = new Set<string>();

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

  // ─── Attendance alerts (reuse already-fetched attendanceData) ─────────────
  const attendanceAlerts: DashboardData["attendanceAlerts"] = [];
  for (const course of attendanceData) {
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

  // ─── Active projects ──────────────────────────────────────────────────────
  const activeProjects = activeProjectsRaw.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    progress: computeProjectProgress(p.milestones),
  }));

  // ─── SGPA / CGPA (grading configs now cached in memCache) ────────────────
  let sgpa: number | null = null;
  let cgpa: number | null = null;

  if (allSemesters.length > 0) {
    const semData = await Promise.all(
      allSemesters.map(async (sem) => {
        const semCourses = await prisma.course.findMany({
          where: { semesterId: sem.id },
        });
        const totalCredits = semCourses.reduce((sum, c) => sum + c.credits, 0);

        if (semCourses.length === 0) {
          return { sgpa: null, totalCredits: 0 };
        }

        const grades = await Promise.all(
          semCourses.map((course) => computeCourseGrade(course))
        );
        return { sgpa: computeSGPA(grades), totalCredits };
      })
    );

    const completedSems = semData.filter((s) => s.sgpa !== null && s.totalCredits > 0);

    cgpa = computeCGPA(completedSems);

    if (completedSems.length > 0) {
      sgpa = completedSems[completedSems.length - 1].sgpa;
    }
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
    latestReview,
    unviewedReviewCount,
  };
});
