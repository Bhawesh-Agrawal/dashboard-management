import { prisma } from "@/lib/prisma";
import type { ReviewType } from "@prisma/client";
import { getNow } from "@/lib/clock";
import {
  subDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  format,
  differenceInCalendarDays,
} from "date-fns";
import type { ReviewDataSummary } from "./types";

type DayOfWeekEnum = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";
const JS_DAY_TO_ENUM: DayOfWeekEnum[] = [
  "SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT",
];

/**
 * Get the user's local time from a timezone string.
 * Falls back to server time if no timezone is provided.
 */
function getUserLocalTime(timezone: string | null | undefined): Date {
  if (!timezone) return getNow();

  try {
    const now = getNow();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const get = (type: string) =>
      parts.find((p) => p.type === type)?.value || "0";

    return new Date(
      parseInt(get("year")),
      parseInt(get("month")) - 1,
      parseInt(get("day")),
      parseInt(get("hour")),
      parseInt(get("minute")),
      parseInt(get("second"))
    );
  } catch {
    return getNow();
  }
}

export function getPeriodBounds(
  type: ReviewType,
  date: Date,
  timezone?: string
): { periodStart: Date; periodEnd: Date } {
  switch (type) {
    case "daily": {
      // Use the provided date parameter for consistency with callers.
      // Only fall back to getUserLocalTime if no date is provided.
      const ref = date || getUserLocalTime(timezone);
      const localYear = ref.getFullYear();
      const localMonth = ref.getMonth();
      const localDay = ref.getDate();

      const start = new Date(localYear, localMonth, localDay, 0, 0, 0, 0);
      const end = new Date(localYear, localMonth, localDay, 23, 59, 59, 999);
      return { periodStart: start, periodEnd: end };
    }
    case "weekly":
      return {
        periodStart: startOfWeek(date, { weekStartsOn: 1 }),
        periodEnd: endOfWeek(date, { weekStartsOn: 1 }),
      };
    case "monthly":
      return {
        periodStart: startOfMonth(date),
        periodEnd: endOfMonth(date),
      };
    case "quarterly":
      return {
        periodStart: startOfQuarter(date),
        periodEnd: endOfQuarter(date),
      };
  }
}

export async function fetchReviewData(
  userId: string,
  type: ReviewType,
  date: Date,
  timezone?: string
): Promise<ReviewDataSummary> {
  const { periodStart, periodEnd } = getPeriodBounds(type, date, timezone);

  const lookbackDays =
    type === "daily"
      ? 2
      : type === "weekly"
        ? 7
        : type === "monthly"
          ? 30
          : 90;
  const lookbackStart = subDays(periodStart, lookbackDays);

  const [
    tasks,
    routinesWithCompletions,
    attendanceRecords,
    notes,
    assessments,
    projects,
    classSchedules,
  ] = await Promise.all([
    prisma.task.findMany({
      where: {
        userId,
        OR: [
          { createdAt: { gte: lookbackStart, lte: periodEnd } },
          { dueDate: { gte: lookbackStart, lte: periodEnd } },
          { completedAt: { gte: lookbackStart, lte: periodEnd } },
        ],
      },
      select: {
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        completedAt: true,
        course: { select: { name: true } },
        project: { select: { name: true } },
      },
      orderBy: [{ priority: "asc" }, { dueDate: "asc" }],
    }),

    prisma.routine.findMany({
      where: { userId },
      select: {
        name: true,
        activeDays: true,
        category: true,
        completions: {
          where: { date: { gte: lookbackStart, lte: periodEnd } },
          select: { date: true },
        },
      },
    }),

    prisma.attendanceRecord.findMany({
      where: {
        course: { semester: { isActive: true } },
        date: { gte: periodStart, lte: periodEnd },
      },
      select: {
        status: true,
        date: true,
        course: { select: { name: true, code: true } },
      },
    }),

    prisma.note.findMany({
      where: {
        userId,
        createdAt: { gte: lookbackStart, lte: periodEnd },
      },
      select: { tags: true, courseId: true, createdAt: true },
    }),

    prisma.assessment.findMany({
      where: {
        course: { semester: { isActive: true } },
      },
      select: {
        componentType: true,
        maxMarks: true,
        obtainedMarks: true,
        date: true,
        course: { select: { name: true, code: true } },
      },
    }),

    prisma.project.findMany({
      where: { domain: { userId } },
      select: {
        name: true,
        status: true,
        updatedAt: true,
        milestones: { select: { name: true, isDone: true } },
      },
    }),

    prisma.classSchedule.findMany({
      where: {
        course: { semester: { isActive: true, userId } },
      },
      select: {
        dayOfWeek: true,
        startTime: true,
        endTime: true,
        location: true,
        course: { select: { name: true, code: true } },
      },
      orderBy: { startTime: "asc" },
    }),
  ]);

  const userLocalTime = getUserLocalTime(timezone);
  const dayEnum = JS_DAY_TO_ENUM[userLocalTime.getDay()] as any;
  const classes = type === "daily"
    ? classSchedules
        .filter((c) => c.dayOfWeek === dayEnum)
        .map((c) => ({
          courseName: c.course.name,
          courseCode: c.course.code,
          startTime: c.startTime,
          endTime: c.endTime,
          location: c.location,
        }))
    : [];

  return {
    tasks: tasks.map((t) => ({
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
      completedAt: t.completedAt,
      courseName: t.course?.name ?? null,
      projectName: t.project?.name ?? null,
    })),
    routines: routinesWithCompletions.map((r) => ({
      name: r.name,
      activeDays: r.activeDays,
      category: r.category,
      completions: r.completions.map((c) => c.date),
    })),
    attendance: attendanceRecords.map((a) => ({
      courseName: a.course.name,
      courseCode: a.course.code,
      status: a.status,
      date: a.date,
    })),
    notes: notes.map((n) => ({
      tags: n.tags,
      courseId: n.courseId,
      createdAt: n.createdAt,
    })),
    assessments: assessments.map((a) => ({
      componentType: a.componentType,
      maxMarks: a.maxMarks,
      obtainedMarks: a.obtainedMarks,
      date: a.date,
      courseName: a.course.name,
      courseCode: a.course.code,
    })),
    projects: projects.map((p) => ({
      name: p.name,
      status: p.status,
      updatedAt: p.updatedAt,
      milestones: p.milestones,
    })),
    classes,
    periodStart,
    periodEnd,
  };
}

export function formatReviewDataSummary(
  data: ReviewDataSummary,
  type: ReviewType
): string {
  const now = getNow();
  const lines: string[] = [];

  // ── Tasks ──
  const completedTasks = data.tasks.filter((t) => t.status === "done");
  const openTasks = data.tasks.filter((t) => t.status === "open");
  const overdueTasks = openTasks.filter(
    (t) => t.dueDate && t.dueDate < now
  );

  lines.push(`== TASKS (${type} period) ==`);
  lines.push(
    `Total: ${data.tasks.length} | Completed: ${completedTasks.length} | Open: ${openTasks.length} | Overdue: ${overdueTasks.length}`
  );
  lines.push(
    `Completion rate: ${data.tasks.length > 0 ? Math.round((completedTasks.length / data.tasks.length) * 100) : 0}%`
  );

  if (type === "daily") {
    const relevantTasks = openTasks.filter((t) => !t.dueDate || t.dueDate <= data.periodEnd);
    if (relevantTasks.length > 0) {
      lines.push(
        `Tasks to focus on: ${relevantTasks.slice(0, 10).map((t) => `"${t.title}"${t.dueDate ? ` (due ${format(t.dueDate, "MMM d")})` : ""}`).join(", ")}`
      );
    } else {
      lines.push(`No specific tasks due today.`);
    }
    
    lines.push(`\n== TODAY'S SCHEDULE ==`);
    if (data.classes.length === 0) {
      lines.push("No classes scheduled today.");
    } else {
      for (const c of data.classes) {
        lines.push(`- ${c.startTime}-${c.endTime}: ${c.courseName} (${c.courseCode || ""}) ${c.location ? `at ${c.location}` : ""}`);
      }
    }
  } else {
    const highPriorityOpen = openTasks
      .filter((t) => t.priority === 1)
      .slice(0, 5);
    if (highPriorityOpen.length > 0) {
      lines.push(
        `High priority open: ${highPriorityOpen.map((t) => `"${t.title}"${t.dueDate ? ` (due ${format(t.dueDate, "MMM d")})` : ""}`).join(", ")}`
      );
    }
  }

  // ── Routines ──
  lines.push(`\n== ROUTINES ==`);
  if (data.routines.length === 0) {
    lines.push("No routines configured");
  } else {
    for (const r of data.routines) {
      let activeDaysInPeriod = 0;
      const periodDays = differenceInCalendarDays(data.periodEnd, data.periodStart) + 1;
      for (let i = 0; i < periodDays; i++) {
        const day = new Date(data.periodStart);
        day.setDate(day.getDate() + i);
        const dayEnum = JS_DAY_TO_ENUM[day.getDay()];
        if (r.activeDays.includes(dayEnum)) {
          activeDaysInPeriod++;
        }
      }
      const rate =
        activeDaysInPeriod > 0
          ? Math.round((r.completions.length / activeDaysInPeriod) * 100)
          : 0;
      lines.push(
        `${r.name}: ${rate}% adherence (${r.completions.length}/${activeDaysInPeriod} active days)`
      );
    }
  }

  // ── Attendance ──
  if (data.attendance.length > 0) {
    lines.push(`\n== ATTENDANCE ==`);
    const byCourse: Record<string, { present: number; absent: number; name: string }> = {};
    for (const a of data.attendance) {
      const key = a.courseCode || a.courseName;
      if (!byCourse[key]) byCourse[key] = { present: 0, absent: 0, name: a.courseName };
      if (a.status === "present") byCourse[key].present++;
      if (a.status === "absent") byCourse[key].absent++;
    }
    for (const [code, d] of Object.entries(byCourse)) {
      const total = d.present + d.absent;
      const pct = total > 0 ? Math.round((d.present / total) * 100) : 0;
      lines.push(`${code}: ${pct}% (${d.present}/${total} present)`);
    }
  }


  // ── Notes ──
  lines.push(`\n== NOTES ==`);
  lines.push(`${data.notes.length} notes created`);
  if (data.notes.length > 0) {
    const tagFreq: Record<string, number> = {};
    for (const n of data.notes) {
      for (const tag of n.tags) {
        tagFreq[tag] = (tagFreq[tag] || 0) + 1;
      }
    }
    const topTags = Object.entries(tagFreq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8);
    if (topTags.length > 0) {
      lines.push(
        `Top tags: ${topTags.map(([t, c]) => `${t}(${c})`).join(", ")}`
      );
    }
  }

  // ── Assessments ──
  const graded = data.assessments.filter((a) => a.obtainedMarks !== null);
  if (graded.length > 0) {
    lines.push(`\n== ASSESSMENTS (graded) ==`);
    for (const a of graded) {
      lines.push(
        `${a.courseCode || a.courseName} ${a.componentType}: ${a.obtainedMarks}/${a.maxMarks} (${Math.round(((a.obtainedMarks || 0) / a.maxMarks) * 100)}%)`
      );
    }
  }

  // ── Projects ──
  if (data.projects.length > 0) {
    lines.push(`\n== PROJECTS ==`);
    for (const p of data.projects) {
      const done = p.milestones.filter((m) => m.isDone).length;
      const total = p.milestones.length;
      const daysSinceUpdate = differenceInCalendarDays(now, p.updatedAt);
      lines.push(
        `${p.name} (${p.status}): ${total > 0 ? Math.round((done / total) * 100) : 0}% (${done}/${total} milestones, updated ${daysSinceUpdate}d ago)`
      );
    }
  }

  return lines.join("\n");
}
