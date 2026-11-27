import type { DsaDueSummary } from "@/features/dsa/lib/summary";
import type { BriefAssessmentItem, BriefClassItem, BriefEventItem, BriefTaskItem } from "./build";
import type {
  BriefDeadlines,
  BriefKindV2,
  BriefNextUp,
  BriefNoteItem,
  BriefNudgeItem,
  BriefNudgeKind,
  BriefPayloadV2,
  BriefQuickAction,
  BriefStudy,
  BriefTimelineItem,
  BriefTravelV2Item,
  BriefWeatherV2,
} from "./payload-v2";

export interface BriefGoogleEventInput {
  id: string;
  title: string;
  time?: string; // HH:mm (undefined for all-day)
  endTime?: string;
  date: string; // YYYY-MM-DD
  location?: string | null;
  calendarName?: string;
}

export interface BriefNudgeContext {
  hasCurrentSemester: boolean;
  hasTimetable?: boolean;
  upcomingSemester?: {
    id: string;
    name: string;
    daysUntilStart: number;
    hasTimetable: boolean;
  } | null;
  lastEndedSemester?: { name: string; endDate: string } | null;
  hasPushSubscription: boolean;
  hasCitySet: boolean;
  googleCalendarConnected: boolean;
  dsaBankCount: number;
  alreadyShownToday?: Set<BriefNudgeKind>;
}

export interface BriefV2Input {
  kind: BriefKindV2;
  forDate: string; // YYYY-MM-DD
  nowHm: string; // HH:mm in user's local timezone
  generatedAt: string; // ISO
  hasCurrentSemester: boolean;
  unmarkedTodayCount?: number;
  endedClassesToday?: BriefClassItem[];
  classes: BriefClassItem[];
  events: BriefEventItem[];
  googleEvents?: BriefGoogleEventInput[];
  tasksToday: BriefTaskItem[];
  overdueTasks: BriefTaskItem[];
  tasksWithin3Days: BriefTaskItem[];
  assessmentsWithin7Days: BriefAssessmentItem[];
  travel: BriefTravelV2Item[];
  dsaSummary?: DsaDueSummary | null;
  programmeDay?: number | null;
  attemptsLast7Days?: number;
  recentNotes?: BriefNoteItem[];
  weather?: BriefWeatherV2 | null;
  nudgeContext?: BriefNudgeContext;
}

function hmToMinutes(hm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function minutesToHm(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Build merged, time-ordered timeline from classes (current semester only),
 * local events, and Google Calendar events, labelling free gaps of 60+ minutes.
 * For midday briefs, filters to items remaining after `nowHm`.
 */
export function buildTimelineSection(input: {
  kind: BriefKindV2;
  nowHm: string;
  hasCurrentSemester: boolean;
  classes: BriefClassItem[];
  events: BriefEventItem[];
  googleEvents?: BriefGoogleEventInput[];
}): BriefTimelineItem[] {
  const raw: BriefTimelineItem[] = [];

  if (input.hasCurrentSemester) {
    for (const c of input.classes) {
      raw.push({
        id: `class-${c.courseId}-${c.startTime}`,
        kind: "class",
        title: c.courseName,
        startTime: c.startTime,
        endTime: c.endTime,
        location: c.location ?? null,
        href: `/courses/${c.courseId}`,
        courseId: c.courseId,
      });
    }
  }

  for (const e of input.events) {
    raw.push({
      id: `event-${e.id}`,
      kind: "event",
      title: e.title,
      startTime: e.time,
      location: e.location ?? null,
      href: "/calendar",
    });
  }

  for (const g of input.googleEvents ?? []) {
    if (!g.time) continue; // All-day events have no timed slot
    raw.push({
      id: `google-${g.id}`,
      kind: "google_event",
      title: g.title,
      startTime: g.time,
      endTime: g.endTime,
      location: g.location ?? null,
      href: "/calendar",
      sourceLabel: g.calendarName ?? "Google Calendar",
    });
  }

  raw.sort((a, b) => a.startTime.localeCompare(b.startTime));

  const nowMin = hmToMinutes(input.nowHm);
  const filtered =
    input.kind === "midday" && nowMin !== null
      ? raw.filter((item) => {
          const endMin = item.endTime ? hmToMinutes(item.endTime) : null;
          const startMin = hmToMinutes(item.startTime);
          if (endMin !== null) return endMin > nowMin;
          return startMin !== null ? startMin >= nowMin : true;
        })
      : raw;

  const withGaps: BriefTimelineItem[] = [];
  for (let i = 0; i < filtered.length; i++) {
    const curr = filtered[i];
    withGaps.push(curr);

    const next = filtered[i + 1];
    if (!next) continue;

    const currEnd = hmToMinutes(curr.endTime ?? curr.startTime);
    const nextStart = hmToMinutes(next.startTime);
    if (currEnd !== null && nextStart !== null) {
      const gap = nextStart - currEnd;
      if (gap >= 60) {
        const hrs = Math.floor(gap / 60);
        const mins = gap % 60;
        const label =
          mins === 0 ? `${hrs}h free gap` : `${hrs}h ${mins}m free gap`;
        withGaps.push({
          id: `gap-${curr.id}-${next.id}`,
          kind: "gap",
          title: label,
          startTime: minutesToHm(currEnd),
          endTime: minutesToHm(nextStart),
          durationMinutes: gap,
        });
      }
    }
  }

  return withGaps;
}

/**
 * Find the next class, event, or deadline within 12 hours (720 minutes) at generation time.
 */
export function buildNextUpSection(input: {
  kind: BriefKindV2;
  nowHm: string;
  timeline: BriefTimelineItem[];
  tasksToday: BriefTaskItem[];
}): BriefNextUp | null {
  if (input.kind === "evening") {
    // Evening previews tomorrow; pick earliest tomorrow commitment if present
    const first = input.timeline.find((t) => t.kind !== "gap");
    if (!first) return null;
    const startMin = hmToMinutes(first.startTime);
    const nowMin = hmToMinutes(input.nowHm);
    if (startMin === null || nowMin === null) return null;
    const minsTomorrow = 24 * 60 - nowMin + startMin;
    if (minsTomorrow > 12 * 60) return null;
    return {
      title: first.title,
      kind: first.kind === "class" ? "class" : "event",
      startsAt: first.startTime,
      minutesRemaining: minsTomorrow,
      location: first.location ?? null,
      href: first.href,
    };
  }

  const nowMin = hmToMinutes(input.nowHm);
  if (nowMin === null) return null;

  for (const item of input.timeline) {
    if (item.kind === "gap") continue;
    const startMin = hmToMinutes(item.startTime);
    if (startMin === null) continue;
    const diff = startMin - nowMin;
    if (diff >= 0 && diff <= 12 * 60) {
      return {
        title: item.title,
        kind: item.kind === "class" ? "class" : "event",
        startsAt: item.startTime,
        minutesRemaining: diff,
        location: item.location ?? null,
        href: item.href,
      };
    }
  }

  // Fallback to a task due today if within 12h of end of day (23:59)
  if (input.tasksToday.length > 0) {
    const endOfDayMin = 23 * 60 + 59;
    const diff = endOfDayMin - nowMin;
    if (diff >= 0 && diff <= 12 * 60) {
      return {
        title: input.tasksToday[0].title,
        kind: "deadline",
        startsAt: "23:59",
        minutesRemaining: diff,
        href: "/tasks",
      };
    }
  }

  return null;
}

export function buildDeadlinesSection(input: {
  tasksToday: BriefTaskItem[];
  overdueTasks: BriefTaskItem[];
  tasksWithin3Days: BriefTaskItem[];
  assessmentsWithin7Days: BriefAssessmentItem[];
}): BriefDeadlines | null {
  const overdueTop5 = input.overdueTasks.slice(0, 5);
  const hasAny =
    input.tasksToday.length > 0 ||
    overdueTop5.length > 0 ||
    input.tasksWithin3Days.length > 0 ||
    input.assessmentsWithin7Days.length > 0;

  if (!hasAny) return null;

  return {
    tasksToday: input.tasksToday.slice(0, 5),
    overdueTasks: overdueTop5,
    overdueTotalCount: input.overdueTasks.length,
    tasksWithin3Days: input.tasksWithin3Days.slice(0, 5),
    assessmentsWithin7Days: input.assessmentsWithin7Days.slice(0, 5),
  };
}

export function buildStudySection(input: {
  dsaSummary?: DsaDueSummary | null;
  programmeDay?: number | null;
  attemptsLast7Days?: number;
}): BriefStudy | null {
  const dueToday = input.dsaSummary?.dueToday ?? 0;
  const overdue = input.dsaSummary?.overdue ?? 0;
  const topOverdue = input.dsaSummary?.topOverdue ?? [];
  const isConfigured = input.dsaSummary?.isConfigured ?? false;
  const programmeDay = input.programmeDay ?? null;
  const attemptsLast7Days = input.attemptsLast7Days ?? 0;

  if (!isConfigured && programmeDay === null && attemptsLast7Days === 0) {
    return null;
  }

  return {
    dueToday,
    overdue,
    topOverdue,
    programmeDay,
    attemptsLast7Days,
    isConfigured,
  };
}

export function buildNudgesSection(ctx?: BriefNudgeContext): BriefNudgeItem[] {
  if (!ctx) return [];
  const nudges: BriefNudgeItem[] = [];
  const shown = ctx.alreadyShownToday;

  const pushIfNew = (item: BriefNudgeItem) => {
    if (shown?.has(item.kind)) return;
    nudges.push(item);
  };

  if (!ctx.hasCurrentSemester) {
    if (ctx.upcomingSemester && !ctx.upcomingSemester.hasTimetable) {
      pushIfNew({
        id: "nudge-no-timetable-upcoming",
        kind: "no_timetable",
        title: "Timetable not added yet",
        message: `${ctx.upcomingSemester.name} starts in ${ctx.upcomingSemester.daysUntilStart} ${
          ctx.upcomingSemester.daysUntilStart === 1 ? "day" : "days"
        }, timetable not added yet.`,
        href: `/semesters/${ctx.upcomingSemester.id}/timetable`,
        actionLabel: "Add Timetable",
      });
    } else if (ctx.lastEndedSemester) {
      pushIfNew({
        id: "nudge-semester-ended",
        kind: "semester_ended",
        title: "Semester ended",
        message: `${ctx.lastEndedSemester.name} ended on ${ctx.lastEndedSemester.endDate}, add the next one.`,
        href: "/semesters",
        actionLabel: "Add Semester",
      });
    } else if (!ctx.upcomingSemester) {
      pushIfNew({
        id: "nudge-no-semester",
        kind: "no_current_semester",
        title: "No active semester",
        message: "Add a current semester to see your class schedule in briefs.",
        href: "/semesters",
        actionLabel: "Add Semester",
      });
    }
  } else if (ctx.hasTimetable === false) {
    pushIfNew({
      id: "nudge-no-timetable",
      kind: "no_timetable",
      title: "Timetable not added yet",
      message: "Add your weekly class timetable to see classes in daily briefs.",
      href: "/semesters",
      actionLabel: "Add Timetable",
    });
  }

  if (!ctx.hasPushSubscription) {
    pushIfNew({
      id: "nudge-notifications",
      kind: "notifications_disabled",
      title: "Notifications not enabled",
      message: "Enable push notifications on a device to receive daily briefs.",
      href: "/settings",
      actionLabel: "Enable Push",
    });
  }

  if (!ctx.hasCitySet) {
    pushIfNew({
      id: "nudge-city",
      kind: "no_city",
      title: "No weather city set",
      message: "Set your city in Settings for live forecasts, rain alerts, and AQI.",
      href: "/settings",
      actionLabel: "Set City",
    });
  }

  if (!ctx.googleCalendarConnected) {
    pushIfNew({
      id: "nudge-gcal",
      kind: "google_calendar_disconnected",
      title: "Google Calendar not connected",
      message: "Connect Google Calendar to merge external events into your timeline.",
      href: "/settings",
      actionLabel: "Connect Calendar",
    });
  }

  if (ctx.dsaBankCount === 0) {
    pushIfNew({
      id: "nudge-dsa",
      kind: "dsa_bank_empty",
      title: "DSA bank is empty",
      message: "Import or add DSA problems to track spaced-repetition reviews.",
      href: "/dsa/settings",
      actionLabel: "Setup DSA",
    });
  }

  return nudges;
}

export function buildQuickActions(input: {
  endedClassesToday?: BriefClassItem[];
  study?: BriefStudy | null;
  travel: BriefTravelV2Item[];
  deadlines?: BriefDeadlines | null;
  nudges: BriefNudgeItem[];
}): BriefQuickAction[] {
  const actions: BriefQuickAction[] = [];

  const ended = input.endedClassesToday?.[0];
  if (ended) {
    actions.push({
      id: `act-att-${ended.courseId}`,
      label: `Mark ${ended.courseName} attendance`,
      kind: "mark_attendance",
      href: `/courses/${ended.courseId}`,
      courseId: ended.courseId,
    });
  }

  if (input.study?.isConfigured) {
    actions.push({
      id: "act-dsa-log",
      label: "Log DSA attempt",
      kind: "log_dsa",
      href: "/dsa/log",
    });
  }

  const firstTicket = input.travel.find((t) => t.documents.length > 0)?.documents[0];
  if (firstTicket) {
    actions.push({
      id: `act-ticket-${firstTicket.noteId}`,
      label: `Open ticket: ${firstTicket.title}`,
      kind: "open_ticket",
      href: `/notes/${firstTicket.noteId}`,
    });
  }

  const firstTask =
    input.deadlines?.overdueTasks[0] ?? input.deadlines?.tasksToday[0];
  if (firstTask) {
    actions.push({
      id: `act-task-${firstTask.id}`,
      label: `Open task: ${firstTask.title}`,
      kind: "open_task",
      href: "/tasks",
    });
  }

  const semNudge = input.nudges.find(
    (n) => n.kind === "semester_ended" || n.kind === "no_current_semester"
  );
  if (semNudge) {
    actions.push({
      id: "act-add-semester",
      label: "Add next semester",
      kind: "add_semester",
      href: "/semesters",
    });
  }

  return actions;
}

export function buildFallbackHeadlineAndSummary(input: {
  kind: BriefKindV2;
  isEmptyDay: boolean;
  nextUp: BriefNextUp | null;
  timelineCount: number;
  deadlines: BriefDeadlines | null;
  study: BriefStudy | null;
  unmarkedTodayCount?: number;
  weather?: BriefWeatherV2 | null;
}): { headline: string; summary: string; pushSummary: string } {
  const kindLabel =
    input.kind === "morning"
      ? "Morning"
      : input.kind === "midday"
      ? "Midday"
      : "Evening";

  const overdueCount = input.deadlines?.overdueTotalCount ?? 0;
  const todayCount = input.deadlines?.tasksToday.length ?? 0;
  const dsaDue = (input.study?.dueToday ?? 0) + (input.study?.overdue ?? 0);

  let headline = `${kindLabel} brief`;
  if (input.isEmptyDay) {
    headline =
      input.kind === "evening"
        ? "Open schedule tomorrow"
        : "Clear schedule today";
  } else if (input.nextUp) {
    headline = `Next: ${input.nextUp.title} at ${input.nextUp.startsAt}`;
  } else if (input.timelineCount > 0) {
    headline = `${input.timelineCount} scheduled item${input.timelineCount === 1 ? "" : "s"}`;
  }

  if (headline.length > 90) {
    headline = `${headline.slice(0, 87)}...`;
  }

  const parts: string[] = [];
  if (input.isEmptyDay) {
    parts.push("No timed classes or events");
  } else if (input.timelineCount > 0) {
    parts.push(
      `${input.timelineCount} timed commitment${input.timelineCount === 1 ? "" : "s"}`
    );
  }
  if (overdueCount > 0) parts.push(`${overdueCount} overdue`);
  if (todayCount > 0) parts.push(`${todayCount} due today`);
  if (dsaDue > 0) parts.push(`${dsaDue} DSA due`);
  if (input.kind === "evening" && (input.unmarkedTodayCount ?? 0) > 0) {
    parts.push(`${input.unmarkedTodayCount} unmarked attendance`);
  }
  if (input.weather?.adviceLine) {
    parts.push(input.weather.adviceLine);
  }

  const summary =
    parts.length > 0
      ? parts.slice(0, 3).join(". ") + "."
      : "Review your study queue, deadlines, and recent notes.";

  return {
    headline,
    summary,
    pushSummary: summary,
  };
}

export function buildBriefPayloadV2(input: BriefV2Input): BriefPayloadV2 {
  const timeline = buildTimelineSection({
    kind: input.kind,
    nowHm: input.nowHm,
    hasCurrentSemester: input.hasCurrentSemester,
    classes: input.classes,
    events: input.events,
    googleEvents: input.googleEvents,
  });

  const timedCount = timeline.filter((t) => t.kind !== "gap").length;
  const isEmptyDay = timedCount === 0;

  const nextUp = buildNextUpSection({
    kind: input.kind,
    nowHm: input.nowHm,
    timeline,
    tasksToday: input.tasksToday,
  });

  const deadlines = buildDeadlinesSection({
    tasksToday: input.tasksToday,
    overdueTasks: input.overdueTasks,
    tasksWithin3Days: input.tasksWithin3Days,
    assessmentsWithin7Days: input.assessmentsWithin7Days,
  });

  const study = buildStudySection({
    dsaSummary: input.dsaSummary,
    programmeDay: input.programmeDay,
    attemptsLast7Days: input.attemptsLast7Days,
  });

  const notes = (input.recentNotes ?? []).slice(0, 3);
  const nudges = buildNudgesSection(input.nudgeContext);

  const quickActions = buildQuickActions({
    endedClassesToday: input.endedClassesToday,
    study,
    travel: input.travel,
    deadlines,
    nudges,
  });

  const fallback = buildFallbackHeadlineAndSummary({
    kind: input.kind,
    isEmptyDay,
    nextUp,
    timelineCount: timedCount,
    deadlines,
    study,
    unmarkedTodayCount: input.unmarkedTodayCount,
    weather: input.weather,
  });

  return {
    schemaVersion: 2,
    kind: input.kind,
    forDate: input.forDate,
    generatedAt: input.generatedAt,
    isEmptyDay,
    unmarkedTodayCount: input.unmarkedTodayCount,
    headline: { text: fallback.headline, source: "fallback" },
    summary: fallback.summary,
    nextUp,
    weather: input.weather ?? null,
    timeline,
    deadlines,
    travel: input.travel,
    study,
    notes,
    nudges,
    quickActions,
    pushSummary: fallback.pushSummary,
  };
}
