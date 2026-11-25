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
import { getCurrentSemester } from "@/features/semesters/lib/current";

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
      dashboardPref,
    ] = await Promise.all([
      getCurrentSemester(userId),
      prisma.event.findMany({
        where: {
          dateTime: { gte: today, lte: windowEnd },
          eventType: "birthday",
        },
        orderBy: { dateTime: "asc" },
      }),
      prisma.routine.findMany({
        where: {
          userId,
          activeDays: { has: tomorrowDayOfWeek as "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN" },
        },
        select: { id: true, name: true, specificTime: true },
      }),
      // Activity streak — compute from routine completions in DB scoped to user
      (async () => {
        try {
          const completions = await prisma.routineCompletion.findMany({
            where: {
              routine: { userId },
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
      prisma.userDashboardPreference.findUnique({
        where: { userId },
      }),
    ]);

    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);

    const [todayClasses, attendanceData, allSemesters, googleConnected] =
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
                attendanceRecords: { where: { date: todayStart } },
              },
            })
          : Promise.resolve([]),
        activeSemester
          ? prisma.course.findMany({
              where: { semesterId: activeSemester.id },
              include: { attendanceRecords: { select: { status: true } } },
            })
          : Promise.resolve([]),
        prisma.semester.findMany({ where: { userId }, orderBy: { startDate: "asc" } }),
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

    // Grades (batched prefetch: eliminates N+1 query loop across semesters and courses)
    let sgpa: number | null = null;
    let cgpa: number | null = null;

    if (allSemesters.length > 0) {
      try {
        const semesterIds = allSemesters.map((s) => s.id);
        const allCourses = await prisma.course.findMany({
          where: { semesterId: { in: semesterIds } },
        });

        const courseIds = allCourses.map((c) => c.id);
        const [allAssessments, allAttendance] = await Promise.all([
          prisma.assessment.findMany({ where: { courseId: { in: courseIds } } }),
          prisma.attendanceRecord.findMany({ where: { courseId: { in: courseIds } } }),
        ]);

        const semData = await Promise.all(
          allSemesters.map(async (sem) => {
            const semCourses = allCourses.filter((c) => c.semesterId === sem.id);
            const totalCredits = semCourses.reduce((sum, c) => sum + c.credits, 0);
            const grades = await Promise.all(
              semCourses.map((course) =>
                computeCourseGrade(course, {
                  assessments: allAssessments.filter((a) => a.courseId === course.id),
                  attendanceRecords: allAttendance.filter((a) => a.courseId === course.id),
                })
              )
            );
            return { sgpa: computeSGPA(grades), totalCredits };
          })
        );

        const completedSems = semData.filter((s) => s.sgpa !== null && s.totalCredits > 0);
        cgpa = computeCGPA(completedSems);

        if (activeSemester) {
          const activeIdx = allSemesters.findIndex((s) => s.id === activeSemester.id);
          sgpa = activeIdx !== -1 && semData[activeIdx] ? semData[activeIdx].sgpa : null;
        }
        if (sgpa === null && completedSems.length > 0) {
          sgpa = completedSems[completedSems.length - 1].sgpa;
        }
      } catch (err) {
        console.error("[Sync Dashboard] Failed to compute grades:", err);
      }
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
