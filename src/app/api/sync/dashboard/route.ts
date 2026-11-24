import { NextResponse } from "next/server";
import { getCurrentUserId, UnauthorizedError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  computeSGPA,
  computeCGPA,
  computeAttendancePercent,
} from "@/features/assessments/lib/calculations";
import { computeCourseGrade } from "@/features/assessments/lib/queries";
import {
  fetchGoogleCalendarEvents,
  isGoogleCalendarConnected,
} from "@/features/calendar/lib/google-calendar";
import { getReviewStats } from "@/features/notes/lib/spaced-repetition";

/**
 * Returns server-only dashboard data that isn't in the sync scope.
 * Tasks, routines, events, and routine completions come from Dexie.
 * This route provides: classes, attendance, grades, projects, reviews, etc.
 */
export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const today = new Date();
    const dayOfWeekMap: Record<string, string> = {
      0: "SUN", 1: "MON", 2: "TUE", 3: "WED", 4: "THU", 5: "FRI", 6: "SAT",
    };
    const todayDayOfWeek = dayOfWeekMap[today.getDay()];
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDayOfWeek = dayOfWeekMap[tomorrow.getDay()];

    const windowEnd = new Date(today);
    windowEnd.setDate(windowEnd.getDate() + 7);

    const [
      activeSemester,
      birthdayEvents,
      tomorrowRoutines,
      streakData,
      activeProjectsRaw,
      latestReview,
      unviewedReviewCount,
      reviewStats,
      dashboardPref,
    ] = await Promise.all([
      prisma.semester.findFirst({
        where: { isActive: true },
        include: { courses: true },
      }),
      prisma.event.findMany({
        where: {
          dateTime: { gte: today, lte: windowEnd },
          eventType: "birthday",
        },
        orderBy: { dateTime: "asc" },
      }),
      prisma.routine.findMany({
        where: {
          activeDays: { has: tomorrowDayOfWeek as "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN" },
        },
        select: { id: true, name: true, specificTime: true },
      }),
      // Activity streak — compute from routine completions in DB
      (async () => {
        try {
          const completions = await prisma.routineCompletion.findMany({
            where: {
              date: { gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) },
            },
            select: { date: true },
          });
          const dayMap: Record<string, number> = {};
          for (const c of completions) {
            const key = c.date.toISOString().split("T")[0];
            dayMap[key] = (dayMap[key] || 0) + 1;
          }
          let currentStreak = 0;
          const checkDate = new Date(today);
          checkDate.setHours(0, 0, 0, 0);
          while (true) {
            const key = checkDate.toISOString().split("T")[0];
            if (dayMap[key] && dayMap[key] > 0) {
              currentStreak++;
            } else {
              break;
            }
            checkDate.setDate(checkDate.getDate() - 1);
            if (currentStreak > 365) break;
          }
          return { activityMap: dayMap, currentStreak };
        } catch {
          return { activityMap: {}, currentStreak: 0 };
        }
      })(),
      prisma.project.findMany({
        where: { status: { notIn: ["completed", "archived"] } },
        include: { milestones: { select: { isDone: true, weight: true } } },
        take: 5,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.review.findFirst({
        where: { userId, status: { not: "archived" }, type: { not: "daily" } },
        orderBy: { periodEnd: "desc" },
      }),
      prisma.review.count({
        where: { userId, status: "generated" },
      }),
      getReviewStats(userId),
      prisma.userDashboardPreference.findUnique({
        where: { userId },
      }),
    ]);

    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);

    const [todayClasses, attendanceData, semesterCoursesForGrades, allSemesters, googleConnected] =
      await Promise.all([
        activeSemester
          ? prisma.classSchedule.findMany({
              where: {
                dayOfWeek: todayDayOfWeek as "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN",
                course: { semesterId: activeSemester.id },
              },
              orderBy: { startTime: "asc" },
              include: {
                course: { select: { id: true, name: true, color: true, code: true } },
                exceptions: { where: { date: todayStart } },
              },
            })
          : Promise.resolve([]),
        activeSemester
          ? prisma.course.findMany({
              where: { semesterId: activeSemester.id },
              include: { attendanceRecords: { select: { status: true } } },
            })
          : Promise.resolve([]),
        activeSemester
          ? prisma.course.findMany({ where: { semesterId: activeSemester.id } })
          : Promise.resolve([]),
        prisma.semester.findMany({ orderBy: { startDate: "asc" } }),
        isGoogleCalendarConnected(userId),
      ]);

    // Google Calendar events
    const googleEvents = googleConnected
      ? await fetchGoogleCalendarEvents(today, windowEnd, userId)
      : [];

    // Build birthday list
    const upcomingBirthdays: {
      id: string;
      title: string;
      date: Date;
      type: "birthday";
      linkTo: string;
    }[] = [];
    const seenBirthdayNames = new Set<string>();

    for (const event of googleEvents) {
      if (event.isBirthday) {
        const lowerTitle = event.title.toLowerCase();
        upcomingBirthdays.push({
          id: `google-${event.id}`,
          title: event.title,
          date: event.start,
          type: "birthday",
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
          type: "birthday",
          linkTo: "/calendar",
        });
        seenBirthdayNames.add(lowerTitle);
      }
    }

    // Attendance alerts
    const attendanceAlerts: {
      courseId: string;
      courseName: string;
      courseColor: string | null;
      attendancePercent: number;
    }[] = [];

    for (const course of attendanceData) {
      const present = course.attendanceRecords.filter((r) => r.status === "present").length;
      const absent = course.attendanceRecords.filter((r) => r.status === "absent").length;
      const percent = computeAttendancePercent(present, absent);
      if (percent < 75 && (present + absent) > 0) {
        attendanceAlerts.push({
          courseId: course.id,
          courseName: course.name,
          courseColor: course.color,
          attendancePercent: percent,
        });
      }
    }

    // Grades
    let sgpa: number | null = null;
    let cgpa: number | null = null;

    if (semesterCoursesForGrades.length > 0) {
      try {
        const grades = await Promise.all(
          semesterCoursesForGrades.map((course) => computeCourseGrade(course))
        );
        sgpa = computeSGPA(grades.filter(Boolean) as any);
      } catch {}
    }

    if (allSemesters.length > 0) {
      try {
        const allGrades: any[] = [];
        for (const sem of allSemesters) {
          const semCourses = await prisma.course.findMany({ where: { semesterId: sem.id } });
          for (const course of semCourses) {
            const grade = await computeCourseGrade(course);
            if (grade) allGrades.push(grade);
          }
        }
        cgpa = computeCGPA(allGrades);
      } catch {}
    }

    // Active projects with progress
    const activeProjects = activeProjectsRaw.map((p) => {
      const totalWeight = p.milestones.reduce((sum, m) => sum + m.weight, 0);
      const doneWeight = p.milestones.filter((m) => m.isDone).reduce((sum, m) => sum + m.weight, 0);
      return {
        id: p.id,
        name: p.name,
        color: p.color,
        progress: totalWeight > 0 ? Math.round((doneWeight / totalWeight) * 100) : 0,
      };
    });

    return NextResponse.json({
      todayClasses,
      attendanceAlerts,
      upcomingDeadlines: upcomingBirthdays,
      tomorrowRoutines,
      streakData,
      activeProjects,
      latestReview: latestReview
        ? {
            id: latestReview.id,
            type: latestReview.type,
            periodStart: latestReview.periodStart,
            periodEnd: latestReview.periodEnd,
            status: latestReview.status,
            summary: latestReview.summary,
          }
        : null,
      unviewedReviewCount,
      reviewStats,
      sgpa,
      cgpa,
      widgetOrder: (dashboardPref?.widgetOrder as string[]) || [],
      hiddenWidgets: dashboardPref?.hiddenWidgets || [],
    }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[Sync Dashboard] Failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
}
