import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getNow } from "@/lib/clock";
import { DEFAULT_TIMEZONE, formatDateOnly } from "@/lib/timezone";
import { currentSemesterWhere } from "@/features/semesters/lib/current";
import { getCalendarEntriesForSemester } from "@/features/semesters/lib/calendar-queries";
import { generateOccurrences } from "@/features/attendance/lib/occurrences";
import { getDsaDueSummary } from "@/features/dsa/lib/summary";
import { getLocalTimeParts } from "@/features/notifications/lib/scheduler";
import {
  fetchGoogleCalendarEvents,
  isGoogleCalendarConnected,
} from "@/features/calendar/lib/google-calendar";
import type {
  BriefAssessmentItem,
  BriefClassItem,
  BriefEventItem,
  BriefTaskItem,
} from "./build";
import type {
  BriefKindV2,
  BriefPayloadV2,
  BriefTravelV2Item,
} from "./payload-v2";
import { buildBriefPayloadV2, type BriefGoogleEventInput } from "./sections";
import { narrateBrief, type LlmNarrateFn } from "./narrate";
import { getBriefUserConfig } from "./settings";
import { saveDailyBrief } from "./storage";
import {
  fetchDestinationWeather,
  fetchRichWeather,
  type FetchLike,
} from "./weather";
import { selectTravelEventsWithin48Hours } from "./pin-tickets";

function addDaysDateOnly(dateOnly: string, days: number): string {
  const d = new Date(`${dateOnly}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function getDayOfWeekEnum(
  day: number
): "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" {
  const map = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
  return map[day] ?? "MON";
}

function formatHm(date: Date, timezone: string): string {
  const parts = getLocalTimeParts(date, timezone);
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

async function getClassesForDate(
  userId: string,
  dateOnly: string,
  nowHm?: string,
  timezone = DEFAULT_TIMEZONE
): Promise<{
  hasCurrentSemester: boolean;
  hasSchedule: boolean;
  classes: BriefClassItem[];
  unmarkedCount: number;
  endedUnmarkedClasses: BriefClassItem[];
}> {
  const sem = await prisma.semester.findFirst({
    where: currentSemesterWhere(userId, dateOnly),
    select: { id: true, startDate: true, endDate: true },
  });

  if (!sem) {
    return {
      hasCurrentSemester: false,
      hasSchedule: false,
      classes: [],
      unmarkedCount: 0,
      endedUnmarkedClasses: [],
    };
  }

  const dateUtc = new Date(`${dateOnly}T00:00:00.000Z`);

  const [schedules, calendarEntries] = await Promise.all([
    prisma.classSchedule.findMany({
      where: { course: { semesterId: sem.id } },
      include: {
        course: { select: { id: true, name: true } },
        exceptions: { where: { date: dateUtc } },
      },
    }),
    getCalendarEntriesForSemester(userId, sem.id),
  ]);

  if (schedules.length === 0) {
    return {
      hasCurrentSemester: true,
      hasSchedule: false,
      classes: [],
      unmarkedCount: 0,
      endedUnmarkedClasses: [],
    };
  }

  const courseById = new Map(schedules.map((s) => [s.course.id, s.course]));
  const exceptions = schedules.flatMap((s) =>
    s.exceptions.map((e) => ({ ...e, classScheduleId: e.classScheduleId ?? s.id }))
  );
  const occurrences = generateOccurrences({
    schedules,
    exceptions,
    calendarEntries,
    semesterId: sem.id,
    semesterStartDate: sem.startDate,
    semesterEndDate: sem.endDate,
    startDate: dateOnly,
    endDate: dateOnly,
    timezone,
  });

  const classes: BriefClassItem[] = [];
  const endedUnmarkedClasses: BriefClassItem[] = [];
  let unmarkedCount = 0;

  for (const occ of occurrences) {
    if (occ.status === "cancelled") continue;
    const course = courseById.get(occ.courseId);
    if (!course) continue;

    const classItem: BriefClassItem = {
      courseId: course.id,
      courseName: course.name,
      startTime: occ.startTime,
      endTime: occ.endTime,
      location: occ.location,
    };
    classes.push(classItem);

    const record = await prisma.attendanceRecord.findFirst({
      where: {
        courseId: occ.courseId,
        date: dateUtc,
        OR: [{ classScheduleId: occ.classScheduleId }, { classScheduleId: null }],
      },
      select: { status: true },
    });
    if (!record || record.status === "not_marked") {
      unmarkedCount += 1;
      if (nowHm && occ.endTime <= nowHm) {
        endedUnmarkedClasses.push(classItem);
      }
    }
  }

  return {
    hasCurrentSemester: true,
    hasSchedule: true,
    classes,
    unmarkedCount,
    endedUnmarkedClasses,
  };
}

export async function generateAndPersistBrief(input: {
  userId: string;
  kind: BriefKindV2;
  now?: Date;
  timezone?: string;
  weatherFetcher?: FetchLike;
  llmCall?: LlmNarrateFn;
  includeAqi?: boolean;
  aiHeadline?: boolean;
}): Promise<BriefPayloadV2> {
  const now = input.now ?? getNow();
  const timezone = input.timezone ?? DEFAULT_TIMEZONE;
  const local = getLocalTimeParts(now, timezone);
  const todayStr = local.dateOnly;
  const nowHm = `${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}`;
  const tomorrowStr = addDaysDateOnly(todayStr, 1);
  const forDate = input.kind === "evening" ? tomorrowStr : todayStr;

  const locPref = await prisma.notificationPreference
    .findFirst({
      where: { userId: input.userId, locationLat: { not: null }, locationLon: { not: null } },
      select: { locationName: true, locationLat: true, locationLon: true },
    })
    .catch(() => null);

  const briefConfig = await getBriefUserConfig(input.userId);
  const includeAqi = input.includeAqi ?? briefConfig.includeAqi;
  const aiHeadline = input.aiHeadline ?? briefConfig.aiHeadline;

  const weatherPromise =
    locPref?.locationLat != null && locPref?.locationLon != null
      ? fetchRichWeather({
          latitude: locPref.locationLat,
          longitude: locPref.locationLon,
          dateOnly: forDate,
          locationName: locPref.locationName,
          includeAqi,
          now,
          fetcher: input.weatherFetcher,
        })
      : Promise.resolve(null);

  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const gcalConnectedPromise = isGoogleCalendarConnected(input.userId).catch(() => false);

  const [
    weather,
    dsaSummary,
    rawTasks,
    rawEvents,
    rawAssessments,
    recentNotesRaw,
    dsaSettings,
    attemptsLast7Days,
    dsaBankCount,
    pushSubCount,
    lastSemester,
    gcalConnected,
  ] = await Promise.all([
    weatherPromise,
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
    prisma.note.findMany({
      where: { userId: input.userId, isDocumentLibraryEntry: false },
      orderBy: { updatedAt: "desc" },
      take: 3,
      select: {
        id: true,
        title: true,
        updatedAt: true,
        course: { select: { name: true } },
      },
    }),
    prisma.dsaSettings
      .findUnique({
        where: { userId: input.userId },
        select: { programmeStartDate: true },
      })
      .catch(() => null),
    prisma.dsaAttempt
      .count({
        where: { userId: input.userId, attemptedAt: { gte: sevenDaysAgo } },
      })
      .catch(() => 0),
    prisma.dsaProblem.count({ where: { userId: input.userId } }).catch(() => 0),
    prisma.pushSubscription.count({ where: { userId: input.userId } }).catch(() => 0),
    prisma.semester
      .findFirst({
        where: { userId: input.userId },
        orderBy: { endDate: "desc" },
        select: { name: true, endDate: true },
      })
      .catch(() => null),
    gcalConnectedPromise,
  ]);

  let googleEventsForDate: BriefGoogleEventInput[] = [];
  if (gcalConnected) {
    const rangeStart = new Date(`${forDate}T00:00:00.000Z`);
    const rangeEnd = new Date(`${addDaysDateOnly(forDate, 1)}T23:59:59.999Z`);
    const fetchedGcal = await fetchGoogleCalendarEvents(
      rangeStart,
      rangeEnd,
      input.userId
    ).catch(() => []);
    googleEventsForDate = fetchedGcal
      .filter((e) => getLocalTimeParts(e.start, timezone).dateOnly === forDate)
      .map((e) => ({
        id: e.id,
        title: e.title,
        time: e.isAllDay ? undefined : formatHm(e.start, timezone),
        endTime: e.isAllDay || !e.end ? undefined : formatHm(e.end, timezone),
        date: forDate,
        location: e.location,
        calendarName: e.calendarName,
      }));
  }

  const tasksToday: BriefTaskItem[] = [];
  const overdueTasks: BriefTaskItem[] = [];
  const tasksDueTomorrow: BriefTaskItem[] = [];
  const tasksWithin3Days: BriefTaskItem[] = [];
  const threeDaysStr = addDaysDateOnly(todayStr, 3);

  for (const t of rawTasks) {
    if (!t.dueDate) continue;
    const dueStr = getLocalTimeParts(t.dueDate, timezone).dateOnly;
    const item: BriefTaskItem = {
      id: t.id,
      title: t.title,
      dueDate: dueStr,
      isOverdue: dueStr < todayStr,
      courseName: t.course?.name ?? null,
    };
    if (dueStr < todayStr) overdueTasks.push(item);
    else if (dueStr === todayStr) tasksToday.push(item);
    else if (dueStr === tomorrowStr) {
      tasksDueTomorrow.push(item);
      tasksWithin3Days.push(item);
    } else if (dueStr <= threeDaysStr) {
      tasksWithin3Days.push(item);
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

  const assessmentsWithin7Days: BriefAssessmentItem[] = [];
  for (const a of rawAssessments) {
    if (!a.date) continue;
    assessmentsWithin7Days.push({
      id: a.id,
      title: String(a.componentType).replace(/_/g, " "),
      courseName: a.course.name,
      dueDate: formatDateOnly(a.date),
    });
  }

  const formatTravelLabel = (d: Date) => {
    const p = getLocalTimeParts(d, timezone);
    return `${p.dateOnly} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
  };
  const travelBase = selectTravelEventsWithin48Hours(
    rawEvents,
    now,
    formatTravelLabel
  );
  const travelV2: BriefTravelV2Item[] = await Promise.all(
    travelBase.map(async (tr) => {
      const travelDate = tr.dateTimeLabel.slice(0, 10);
      const destinationWeather =
        tr.location && tr.location.trim().length >= 2
          ? await fetchDestinationWeather({
              location: tr.location,
              dateOnly: travelDate,
              now,
              fetcher: input.weatherFetcher,
            })
          : null;
      return {
        ...tr,
        destinationWeather,
        ticketsPinnedCount: tr.documents.length,
      };
    })
  );

  const programmeDay = dsaSettings?.programmeStartDate
    ? Math.max(
        1,
        Math.floor(
          (now.getTime() - dsaSettings.programmeStartDate.getTime()) / (24 * 60 * 60 * 1000)
        ) + 1
      )
    : null;

  const recentNotes = recentNotesRaw.map((n) => ({
    id: n.id,
    title: n.title || "Untitled note",
    updatedAt: formatDateOnly(n.updatedAt),
    courseName: n.course?.name ?? null,
    href: `/notes/${n.id}`,
  }));

  const [todayClassInfo, targetClassInfo] = await Promise.all([
    getClassesForDate(input.userId, todayStr, nowHm),
    input.kind === "evening"
      ? getClassesForDate(input.userId, tomorrowStr)
      : Promise.resolve(null),
  ]);

  const activeClassInfo = targetClassInfo ?? todayClassInfo;

  let payload = buildBriefPayloadV2({
    kind: input.kind,
    forDate,
    nowHm,
    generatedAt: now.toISOString(),
    hasCurrentSemester: activeClassInfo.hasCurrentSemester,
    unmarkedTodayCount: todayClassInfo.unmarkedCount,
    endedClassesToday: todayClassInfo.endedUnmarkedClasses,
    classes: activeClassInfo.classes,
    events: input.kind === "evening" ? eventsTomorrow : eventsToday,
    googleEvents: googleEventsForDate,
    tasksToday: input.kind === "evening" ? tasksDueTomorrow : tasksToday,
    overdueTasks,
    tasksWithin3Days,
    assessmentsWithin7Days,
    travel: travelV2,
    dsaSummary,
    programmeDay,
    attemptsLast7Days,
    recentNotes,
    weather,
    nudgeContext: {
      hasCurrentSemester: todayClassInfo.hasCurrentSemester,
      lastEndedSemester: lastSemester
        ? { name: lastSemester.name, endDate: formatDateOnly(lastSemester.endDate) }
        : null,
      hasPushSubscription: pushSubCount > 0,
      hasCitySet: Boolean(locPref),
      googleCalendarConnected: gcalConnected,
      dsaBankCount,
    },
  });

  const narrated = await narrateBrief(payload, {
    aiHeadline,
    llmCall: input.llmCall,
  });

  payload = {
    ...payload,
    headline: narrated.headline,
    summary: narrated.summary,
    pushSummary: narrated.summary,
  };

  await saveDailyBrief({
    userId: input.userId,
    kind: input.kind,
    forDate,
    payload: payload as unknown as Prisma.InputJsonValue,
    generatedAt: now,
  });

  return payload;
}
