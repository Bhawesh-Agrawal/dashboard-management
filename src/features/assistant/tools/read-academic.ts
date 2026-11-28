import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ownerWhere } from "@/lib/owner-scoping";
import { getUserTimezone } from "@/lib/timezone-server";
import {
  formatDateOnly,
  getTodayInTimezone,
  getTimeInTimezone,
  getClassTimingStatus,
} from "@/lib/timezone";
import { getCurrentSemester } from "@/features/semesters/lib/current";
import { getAcademicEntriesForRange, entriesForDate } from "@/features/semesters/lib/calendar-queries";
import {
  generateOccurrences,
  type OccurrenceCalendarEntry,
  type OccurrenceException,
  type OccurrenceRecord,
  type OccurrenceSchedule,
} from "@/features/attendance/lib/occurrences";
import {
  computeAttendanceMetrics,
  DEFAULT_ATTENDANCE_TARGET_PERCENT,
  resolveAttendanceCounts,
} from "@/features/attendance/lib/calculations";
import type { AssistantSource, AssistantTool } from "./types";

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

async function loadCourseScheduleData(userId: string, semesterId: string) {
  return prisma.course.findMany({
    where: { semesterId, semester: ownerWhere(userId) },
    select: {
      id: true,
      name: true,
      code: true,
      credits: true,
      attendanceMode: true,
      manualPresent: true,
      manualTotalClasses: true,
      targetGrade: true,
      classSchedules: {
        select: {
          id: true,
          courseId: true,
          dayOfWeek: true,
          startTime: true,
          endTime: true,
          location: true,
          effectiveStartDate: true,
          effectiveEndDate: true,
          exceptions: {
            select: {
              id: true,
              classScheduleId: true,
              date: true,
              type: true,
              newStartTime: true,
              newEndTime: true,
              newLocation: true,
            },
          },
        },
      },
      attendanceRecords: {
        select: {
          id: true,
          courseId: true,
          classScheduleId: true,
          date: true,
          status: true,
        },
      },
    },
  });
}

function toOccurrenceInputs(
  course: Awaited<ReturnType<typeof loadCourseScheduleData>>[number],
  academicEntries: Awaited<ReturnType<typeof getAcademicEntriesForRange>>
): {
  schedules: OccurrenceSchedule[];
  exceptions: OccurrenceException[];
  records: OccurrenceRecord[];
  calendarEntries: OccurrenceCalendarEntry[];
} {
  return {
    schedules: course.classSchedules.map((s) => ({
      id: s.id,
      courseId: s.courseId,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      location: s.location,
      effectiveStartDate: s.effectiveStartDate,
      effectiveEndDate: s.effectiveEndDate,
    })),
    exceptions: course.classSchedules.flatMap((s) =>
      s.exceptions.map((ex) => ({
        id: ex.id,
        classScheduleId: ex.classScheduleId,
        date: ex.date,
        type: ex.type,
        newStartTime: ex.newStartTime,
        newEndTime: ex.newEndTime,
        newLocation: ex.newLocation,
      }))
    ),
    records: course.attendanceRecords.map((r) => ({
      id: r.id,
      courseId: r.courseId,
      classScheduleId: r.classScheduleId,
      date: r.date,
      status: r.status,
    })),
    calendarEntries: academicEntries.map((e) => ({
      id: e.id,
      semesterId: e.semesterId,
      kind: e.kind,
      title: e.title,
      startDate: e.startDate,
      endDate: e.endDate,
      cancelsClasses: e.cancelsClasses,
      followsWeekday: e.followsWeekday,
    })),
  };
}

export const getTodayOverviewTool: AssistantTool<Record<string, never>> = {
  name: "get_today_overview",
  description:
    "Get today's full overview in the user's timezone: current date/time, active semester, today's classes with status, calendar events, tasks due/overdue, upcoming assessments, and academic calendar entries.",
  inputSchema: z.object({}),
  parameters: { type: "object", properties: {} },
  async execute(userId) {
    const tz = await getUserTimezone(userId);
    const today = getTodayInTimezone(tz);
    const nowHm = getTimeInTimezone(tz);
    const semester = await getCurrentSemester(userId);
    const academicEntries = await getAcademicEntriesForRange(userId, today, today);

    const todayStart = new Date(`${today}T00:00:00.000Z`);
    const todayEnd = new Date(`${today}T23:59:59.999Z`);
    const next7End = new Date(`${addDays(today, 7)}T23:59:59.999Z`);

    const [events, tasks, assessments] = await Promise.all([
      prisma.event.findMany({
        where: {
          ...ownerWhere(userId),
          dateTime: { gte: todayStart, lte: todayEnd },
        },
        select: { id: true, title: true, eventType: true, dateTime: true, endTime: true, location: true },
        orderBy: { dateTime: "asc" },
        take: 15,
      }),
      prisma.task.findMany({
        where: {
          ...ownerWhere(userId),
          status: "open",
          dueDate: { lte: todayEnd },
        },
        select: { id: true, title: true, dueDate: true, priority: true, status: true },
        orderBy: [{ dueDate: "asc" }, { priority: "asc" }],
        take: 15,
      }),
      prisma.assessment.findMany({
        where: {
          course: { semester: ownerWhere(userId) },
          obtainedMarks: null,
          date: { gte: todayStart, lte: next7End },
        },
        select: {
          id: true,
          componentType: true,
          date: true,
          maxMarks: true,
          course: { select: { name: true, code: true } },
        },
        orderBy: { date: "asc" },
        take: 10,
      }),
    ]);

    const classesToday: Array<{
      courseId: string;
      courseName: string;
      startTime: string;
      endTime: string;
      location: string | null;
      status: string;
      timing: string;
    }> = [];
    const sources: AssistantSource[] = [];

    if (semester) {
      sources.push({
        type: "semester",
        id: semester.id,
        title: semester.name,
        href: `/semesters/${semester.id}`,
      });
      const courses = await loadCourseScheduleData(userId, semester.id);

      for (const c of courses) {
        const inputs = toOccurrenceInputs(c, academicEntries);
        const occurrences = generateOccurrences({
          ...inputs,
          semesterId: semester.id,
          semesterStartDate: semester.startDate,
          semesterEndDate: semester.endDate,
          startDate: today,
          endDate: today,
          timezone: tz,
        });

        for (const occ of occurrences) {
          classesToday.push({
            courseId: c.id,
            courseName: c.code ? `${c.code} ${c.name}` : c.name,
            startTime: occ.startTime,
            endTime: occ.endTime,
            location: occ.location ?? null,
            status: occ.status,
            timing: getClassTimingStatus({
              date: today,
              startTime: occ.startTime,
              endTime: occ.endTime,
              timezone: tz,
            }),
          });
        }
      }
      classesToday.sort((a, b) => a.startTime.localeCompare(b.startTime));
    }

    for (const t of tasks.slice(0, 5)) {
      sources.push({ type: "task", id: t.id, title: t.title, href: "/tasks" });
    }
    for (const e of events.slice(0, 5)) {
      sources.push({ type: "event", id: e.id, title: e.title, href: "/calendar" });
    }

    return {
      data: {
        today,
        nowHm,
        timezone: tz,
        semester: semester ? { id: semester.id, name: semester.name } : null,
        academicCalendar: entriesForDate(academicEntries, today).map((e) => ({
          kind: e.kind,
          title: e.title,
          cancelsClasses: e.cancelsClasses,
          followsWeekday: e.followsWeekday,
        })),
        classesToday,
        eventsToday: events.map((e) => ({
          id: e.id,
          title: e.title,
          type: e.eventType,
          dateTime: e.dateTime.toISOString(),
          endTime: e.endTime?.toISOString() ?? null,
          location: e.location,
        })),
        tasksDueOrOverdue: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          dueDate: t.dueDate ? formatDateOnly(t.dueDate) : null,
          priority: t.priority,
        })),
        upcomingAssessments: assessments.map((a) => ({
          id: a.id,
          title: `${a.course.code || a.course.name} ${a.componentType}`,
          type: a.componentType,
          course: a.course.code || a.course.name,
          dueDate: a.date ? formatDateOnly(a.date) : null,
        })),
      },
      sources,
    };
  },
};

const scheduleInputSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const getScheduleTool: AssistantTool<z.infer<typeof scheduleInputSchema>> = {
  name: "get_schedule",
  description:
    "Get class schedule occurrences (including holidays, cancelled, follows-weekday, and exam periods) and calendar events between from and to (YYYY-MM-DD, max 31 days).",
  inputSchema: scheduleInputSchema,
  parameters: {
    type: "object",
    required: ["from", "to"],
    properties: {
      from: { type: "string", description: "Start date YYYY-MM-DD" },
      to: { type: "string", description: "End date YYYY-MM-DD" },
    },
  },
  async execute(userId, input) {
    const tz = await getUserTimezone(userId);
    const rangeEnd = input.to > addDays(input.from, 31) ? addDays(input.from, 31) : input.to;

    const [semester, academicEntries, events] = await Promise.all([
      getCurrentSemester(userId),
      getAcademicEntriesForRange(userId, input.from, rangeEnd),
      prisma.event.findMany({
        where: {
          ...ownerWhere(userId),
          dateTime: {
            gte: new Date(`${input.from}T00:00:00.000Z`),
            lte: new Date(`${rangeEnd}T23:59:59.999Z`),
          },
        },
        select: { id: true, title: true, eventType: true, dateTime: true, endTime: true, location: true },
        orderBy: { dateTime: "asc" },
        take: 25,
      }),
    ]);

    const classes: Array<{
      date: string;
      courseId: string;
      course: string;
      startTime: string;
      endTime: string;
      status: string;
      location: string | null;
    }> = [];

    if (semester) {
      const courses = await loadCourseScheduleData(userId, semester.id);

      for (const c of courses) {
        const inputs = toOccurrenceInputs(c, academicEntries);
        const occurrences = generateOccurrences({
          ...inputs,
          semesterId: semester.id,
          semesterStartDate: semester.startDate,
          semesterEndDate: semester.endDate,
          startDate: input.from,
          endDate: rangeEnd,
          timezone: tz,
        });

        for (const occ of occurrences) {
          classes.push({
            date: occ.date,
            courseId: c.id,
            course: c.code || c.name,
            startTime: occ.startTime,
            endTime: occ.endTime,
            status: occ.status,
            location: occ.location ?? null,
          });
        }
      }
      classes.sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`));
    }

    return {
      data: {
        from: input.from,
        to: rangeEnd,
        semester: semester ? semester.name : null,
        academicEntries: academicEntries.map((e) => ({
          kind: e.kind,
          title: e.title,
          startDate: formatDateOnly(e.startDate),
          endDate: formatDateOnly(e.endDate),
          cancelsClasses: e.cancelsClasses,
          followsWeekday: e.followsWeekday,
        })),
        classes,
        events: events.map((e) => ({
          id: e.id,
          title: e.title,
          type: e.eventType,
          date: formatDateOnly(e.dateTime),
          dateTime: e.dateTime.toISOString(),
          location: e.location,
        })),
      },
      sources: events.slice(0, 5).map((e) => ({
        type: "event" as const,
        id: e.id,
        title: e.title,
        href: "/calendar",
      })),
    };
  },
};

const attendanceInputSchema = z.object({
  course: z.string().optional(),
});

export const getAttendanceTool: AssistantTool<z.infer<typeof attendanceInputSchema>> = {
  name: "get_attendance",
  description:
    "Get attendance metrics (attended, total counted, percent, target, canMiss, mustAttend, unmarked past classes) for all current-semester courses or a matching course.",
  inputSchema: attendanceInputSchema,
  parameters: {
    type: "object",
    properties: {
      course: { type: "string", description: "Optional course name or code filter" },
    },
  },
  async execute(userId, input) {
    const tz = await getUserTimezone(userId);
    const today = getTodayInTimezone(tz);
    const semester = await getCurrentSemester(userId);
    if (!semester) {
      return { data: { semester: null, courses: [] } };
    }

    const courses = await loadCourseScheduleData(userId, semester.id);
    const filter = input.course?.trim().toLowerCase();
    const matched = filter
      ? courses.filter(
          (c) =>
            c.name.toLowerCase().includes(filter) ||
            (c.code && c.code.toLowerCase().includes(filter))
        )
      : courses;

    const academicEntries = await getAcademicEntriesForRange(
      userId,
      formatDateOnly(semester.startDate),
      today
    );

    const rows = matched.map((c) => {
      const counts = resolveAttendanceCounts({
        attendanceMode: c.attendanceMode,
        manualPresent: c.manualPresent,
        manualTotalClasses: c.manualTotalClasses,
        attendanceRecords: c.attendanceRecords,
      });
      const metrics = computeAttendanceMetrics({
        present: counts.present,
        absent: counts.absent,
        targetPercent: DEFAULT_ATTENDANCE_TARGET_PERCENT,
      });

      const inputs = toOccurrenceInputs(c, academicEntries);
      const occurrences = generateOccurrences({
        ...inputs,
        semesterId: semester.id,
        semesterStartDate: semester.startDate,
        semesterEndDate: semester.endDate,
        startDate: formatDateOnly(semester.startDate),
        endDate: today,
        timezone: tz,
      });

      const unmarkedPast = occurrences.filter(
        (o) => o.date <= today && o.status === "unmarked"
      ).length;

      return {
        courseId: c.id,
        name: c.name,
        code: c.code,
        attended: metrics.present,
        totalCounted: metrics.totalCounted,
        percent: metrics.percent,
        target: metrics.targetPercent,
        canMiss: metrics.canMissCount,
        mustAttend: metrics.mustAttendCount,
        status: metrics.status,
        unmarkedPastClasses: unmarkedPast,
      };
    });

    return {
      data: { semester: semester.name, courses: rows },
      sources: rows.slice(0, 6).map((r) => ({
        type: "course" as const,
        id: r.courseId,
        title: r.code ? `${r.code} ${r.name}` : r.name,
        href: `/courses/${r.courseId}`,
      })),
    };
  },
};

export const getCoursesTool: AssistantTool<Record<string, never>> = {
  name: "get_courses",
  description: "List courses in the active semester with codes, credits, target grade, and assessments.",
  inputSchema: z.object({}),
  parameters: { type: "object", properties: {} },
  async execute(userId) {
    const semester = await getCurrentSemester(userId);
    if (!semester) return { data: { semester: null, courses: [] } };

    const courses = await prisma.course.findMany({
      where: { semesterId: semester.id, semester: ownerWhere(userId) },
      select: {
        id: true,
        name: true,
        code: true,
        credits: true,
        targetGrade: true,
        assessments: {
          select: { componentType: true, maxMarks: true, obtainedMarks: true },
        },
      },
      orderBy: { name: "asc" },
    });

    return {
      data: {
        semester: semester.name,
        courses: courses.map((c) => ({
          id: c.id,
          name: c.name,
          code: c.code,
          credits: c.credits,
          targetGrade: c.targetGrade,
          assessments: c.assessments,
        })),
      },
      sources: courses.map((c) => ({
        type: "course" as const,
        id: c.id,
        title: c.code ? `${c.code} ${c.name}` : c.name,
        href: `/courses/${c.id}`,
      })),
    };
  },
};

const academicRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const getAcademicCalendarTool: AssistantTool<z.infer<typeof academicRangeSchema>> = {
  name: "get_academic_calendar",
  description:
    "Get academic calendar entries (holidays, breaks, exam periods, no_classes, follows_weekday, notes) for a date range YYYY-MM-DD.",
  inputSchema: academicRangeSchema,
  parameters: {
    type: "object",
    required: ["from", "to"],
    properties: {
      from: { type: "string" },
      to: { type: "string" },
    },
  },
  async execute(userId, input) {
    const entries = await getAcademicEntriesForRange(userId, input.from, input.to);
    return {
      data: {
        entries: entries.map((e) => ({
          id: e.id,
          kind: e.kind,
          title: e.title,
          startDate: formatDateOnly(e.startDate),
          endDate: formatDateOnly(e.endDate),
          cancelsClasses: e.cancelsClasses,
          followsWeekday: e.followsWeekday,
        })),
      },
      sources: entries.slice(0, 5).map((e) => ({
        type: "semester" as const,
        id: e.semesterId,
        title: e.title,
        href: `/semesters/${e.semesterId}/calendar`,
      })),
    };
  },
};
