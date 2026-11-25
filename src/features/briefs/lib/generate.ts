import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getNow } from "@/lib/clock";
import { DEFAULT_TIMEZONE, formatDateOnly } from "@/lib/timezone";

function addDaysDateOnly(dateOnly: string, days: number): string {
  const d = new Date(`${dateOnly}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
import { currentSemesterWhere } from "@/features/semesters/lib/current";
import { getDsaDueSummary } from "@/features/dsa/lib/summary";
import { getLocalTimeParts } from "@/features/notifications/lib/scheduler";
import {
  buildEveningBriefPayload,
  buildMorningBriefPayload,
  type BriefAssessmentItem,
  type BriefClassItem,
  type BriefEventItem,
  type BriefPayload,
  type BriefTaskItem,
  type BriefTravelItem,
} from "./build";
import { saveDailyBrief } from "./storage";
import { fetchWeatherLine, type FetchLike } from "./weather";
import { selectTravelEventsWithin48Hours } from "./pin-tickets";

function getDayOfWeekEnum(day: number): "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" {
  const map = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
  return map[day] ?? "MON";
}

function formatHm(date: Date, timezone: string): string {
  const parts = getLocalTimeParts(date, timezone);
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

async function getClassesForDate(
  userId: string,
  dateOnly: string
): Promise<{ hasCurrentSemester: boolean; classes: BriefClassItem[]; unmarkedCount: number }> {
  const sem = await prisma.semester.findFirst({
    where: currentSemesterWhere(userId, dateOnly),
    select: { id: true },
  });

  if (!sem) {
    return { hasCurrentSemester: false, classes: [], unmarkedCount: 0 };
  }

  const dateUtc = new Date(`${dateOnly}T00:00:00.000Z`);
  const dayOfWeek = getDayOfWeekEnum(dateUtc.getUTCDay());

  const schedules = await prisma.classSchedule.findMany({
    where: {
      course: { semesterId: sem.id },
      dayOfWeek,
      OR: [{ effectiveStartDate: null }, { effectiveStartDate: { lte: dateUtc } }],
      AND: [{ OR: [{ effectiveEndDate: null }, { effectiveEndDate: { gte: dateUtc } }] }],
    },
    include: {
      course: { select: { id: true, name: true } },
      exceptions: { where: { date: dateUtc } },
    },
  });

  const classes: BriefClassItem[] = [];
  let unmarkedCount = 0;

  for (const s of schedules) {
    const exc = s.exceptions[0];
    if (exc?.type === "cancelled") continue;

    const startTime = exc?.type === "rescheduled" && exc.newStartTime ? exc.newStartTime : s.startTime;
    const endTime = exc?.type === "rescheduled" && exc.newEndTime ? exc.newEndTime : s.endTime;
    const location = exc?.type === "rescheduled" && exc.newLocation ? exc.newLocation : s.location;

    classes.push({
      courseId: s.course.id,
      courseName: s.course.name,
      startTime,
      endTime,
      location,
    });

    const record = await prisma.attendanceRecord.findFirst({
      where: {
        courseId: s.courseId,
        date: dateUtc,
        OR: [{ classScheduleId: s.id }, { classScheduleId: null }],
      },
      select: { status: true },
    });
    if (!record || record.status === "not_marked") {
      unmarkedCount += 1;
    }
  }

  return { hasCurrentSemester: true, classes, unmarkedCount };
}

export async function generateAndPersistBrief(input: {
  userId: string;
  kind: "morning" | "evening";
  now?: Date;
  timezone?: string;
  weatherFetcher?: FetchLike;
}): Promise<BriefPayload> {
  const now = input.now ?? getNow();
  const timezone = input.timezone ?? DEFAULT_TIMEZONE;
  const todayStr = getLocalTimeParts(now, timezone).dateOnly;
  const tomorrowStr = addDaysDateOnly(todayStr, 1);
  const forDate = input.kind === "morning" ? todayStr : tomorrowStr;

  const locPref = await prisma.notificationPreference
    .findFirst({
      where: { userId: input.userId, locationLat: { not: null }, locationLon: { not: null } },
      select: { locationName: true, locationLat: true, locationLon: true },
    })
    .catch(() => null);

  const weatherLine =
    locPref?.locationLat != null && locPref?.locationLon != null
      ? await fetchWeatherLine({
          latitude: locPref.locationLat,
          longitude: locPref.locationLon,
          dateOnly: forDate,
          locationName: locPref.locationName,
          now,
          fetcher: input.weatherFetcher,
        })
      : null;

  const [dsaSummary, rawTasks, rawEvents, rawAssessments] = await Promise.all([
    getDsaDueSummary(input.userId, now).catch(() => null),
    prisma.task.findMany({
      where: {
        userId: input.userId,
        status: "open",
        dueDate: { not: null },
      },
      include: { course: { select: { name: true } } },
      orderBy: [{ dueDate: "asc" }, { priority: "asc" }],
    }),
    prisma.event.findMany({
      where: {
        userId: input.userId,
        dateTime: {
          gte: new Date(now.getTime() - 12 * 60 * 60 * 1000),
          lte: new Date(now.getTime() + 72 * 60 * 60 * 1000),
        },
      },
      include: {
        eventDocuments: {
          include: {
            note: {
              select: { id: true, title: true, fileName: true, s3Url: true },
            },
          },
        },
      },
      orderBy: { dateTime: "asc" },
    }),
    prisma.assessment.findMany({
      where: {
        course: { semester: { userId: input.userId } },
        date: {
          gte: new Date(`${todayStr}T00:00:00.000Z`),
          lte: new Date(`${addDaysDateOnly(todayStr, 7)}T23:59:59.999Z`),
        },
      },
      include: { course: { select: { name: true } } },
      orderBy: { date: "asc" },
    }),
  ]);

  const tasksTodayOrOverdue: BriefTaskItem[] = [];
  const tasksDueTomorrow: BriefTaskItem[] = [];

  for (const t of rawTasks) {
    if (!t.dueDate) continue;
    const dueStr = getLocalTimeParts(t.dueDate, timezone).dateOnly;
    if (dueStr <= todayStr) {
      tasksTodayOrOverdue.push({
        id: t.id,
        title: t.title,
        dueDate: dueStr,
        isOverdue: dueStr < todayStr,
        courseName: t.course?.name ?? null,
      });
    } else if (dueStr === tomorrowStr) {
      tasksDueTomorrow.push({
        id: t.id,
        title: t.title,
        dueDate: dueStr,
        isOverdue: false,
        courseName: t.course?.name ?? null,
      });
    }
  }

  const eventsToday: BriefEventItem[] = [];
  const eventsTomorrow: BriefEventItem[] = [];
  for (const e of rawEvents) {
    const eParts = getLocalTimeParts(e.dateTime, timezone);
    const item: BriefEventItem = {
      id: e.id,
      title: e.title,
      time: formatHm(e.dateTime, timezone),
      date: eParts.dateOnly,
      location: e.location,
    };
    if (eParts.dateOnly === todayStr) eventsToday.push(item);
    else if (eParts.dateOnly === tomorrowStr) eventsTomorrow.push(item);
  }

  const assessmentsWithin3Days: BriefAssessmentItem[] = [];
  const assessmentsWithin7Days: BriefAssessmentItem[] = [];
  const threeDaysStr = addDaysDateOnly(todayStr, 3);
  for (const a of rawAssessments) {
    if (!a.date) continue;
    const dueStr = formatDateOnly(a.date);
    const item: BriefAssessmentItem = {
      id: a.id,
      title: String(a.componentType).replace(/_/g, " "),
      courseName: a.course.name,
      dueDate: dueStr,
    };
    if (dueStr <= threeDaysStr) assessmentsWithin3Days.push(item);
    assessmentsWithin7Days.push(item);
  }

  const formatTravelLabel = (d: Date) => {
    const p = getLocalTimeParts(d, timezone);
    return `${p.dateOnly} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
  };
  const travel48h: BriefTravelItem[] = selectTravelEventsWithin48Hours(
    rawEvents,
    now,
    formatTravelLabel
  );
  const travelTomorrow: BriefTravelItem[] = rawEvents
    .filter((e) => e.isTravel && getLocalTimeParts(e.dateTime, timezone).dateOnly === tomorrowStr)
    .map((e) => ({
      eventId: e.id,
      title: e.title,
      dateTimeLabel: formatTravelLabel(e.dateTime),
      location: e.location,
      documents: e.eventDocuments.map((ed) => ({
        noteId: ed.note.id,
        title: ed.note.fileName || ed.note.title || "Ticket",
        offlineUrl: ed.note.s3Url || `/notes/${ed.note.id}`,
      })),
    }));

  let payload: BriefPayload;
  if (input.kind === "morning") {
    const classInfo = await getClassesForDate(input.userId, todayStr);
    payload = buildMorningBriefPayload({
      forDate: todayStr,
      hasCurrentSemester: classInfo.hasCurrentSemester,
      weatherLine,
      classes: classInfo.classes,
      events: eventsToday,
      tasks: tasksTodayOrOverdue,
      travel: travel48h,
      dsaSummary,
      assessments: assessmentsWithin3Days,
    });
  } else {
    const [todayClassInfo, tomorrowClassInfo] = await Promise.all([
      getClassesForDate(input.userId, todayStr),
      getClassesForDate(input.userId, tomorrowStr),
    ]);
    payload = buildEveningBriefPayload({
      forDate: tomorrowStr,
      hasCurrentSemester: todayClassInfo.hasCurrentSemester || tomorrowClassInfo.hasCurrentSemester,
      weatherLine,
      unmarkedTodayCount: todayClassInfo.unmarkedCount,
      tomorrowClasses: tomorrowClassInfo.classes,
      tomorrowEvents: eventsTomorrow,
      tasksDueTomorrow,
      assessmentsWithin7Days,
      travelTomorrow,
      tomorrowDsaDueCount: 0,
    });
  }

  await saveDailyBrief({
    userId: input.userId,
    kind: input.kind,
    forDate,
    payload: payload as unknown as Prisma.InputJsonValue,
    generatedAt: now,
  });

  return payload;
}
