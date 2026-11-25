import type { DsaDueSummary } from "@/features/dsa/lib/summary";

export interface BriefClassItem {
  courseId: string;
  courseName: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  location?: string | null;
}

export interface BriefEventItem {
  id: string;
  title: string;
  time: string; // HH:mm
  date: string; // YYYY-MM-DD
  location?: string | null;
}

export interface BriefTaskItem {
  id: string;
  title: string;
  dueDate: string; // YYYY-MM-DD
  isOverdue: boolean;
  courseName?: string | null;
}

export interface BriefDocumentRef {
  noteId: string;
  title: string;
  offlineUrl: string;
}

export interface BriefTravelItem {
  eventId: string;
  title: string;
  dateTimeLabel: string;
  location?: string | null;
  documents: BriefDocumentRef[];
}

export interface BriefAssessmentItem {
  id: string;
  title: string;
  courseName: string;
  dueDate: string; // YYYY-MM-DD
}

export interface BriefSectionItem {
  label: string;
  meta?: string;
  href?: string;
  documents?: BriefDocumentRef[];
}

export interface BriefSection {
  id: string;
  title: string;
  linkHref: string;
  linkLabel: string;
  items: BriefSectionItem[];
  totalCount?: number;
}

export interface MorningBriefInput {
  forDate: string; // YYYY-MM-DD (today)
  hasCurrentSemester: boolean;
  weatherLine?: string | null;
  classes: BriefClassItem[];
  events: BriefEventItem[];
  tasks: BriefTaskItem[]; // due today or overdue
  travel: BriefTravelItem[]; // next 48h
  dsaSummary?: DsaDueSummary | null;
  assessments: BriefAssessmentItem[]; // within 3 days
}

export interface EveningBriefInput {
  forDate: string; // YYYY-MM-DD (tomorrow)
  hasCurrentSemester: boolean;
  weatherLine?: string | null;
  unmarkedTodayCount: number;
  tomorrowClasses: BriefClassItem[];
  tomorrowEvents: BriefEventItem[];
  tasksDueTomorrow: BriefTaskItem[];
  assessmentsWithin7Days: BriefAssessmentItem[];
  travelTomorrow: BriefTravelItem[];
  tomorrowDsaDueCount: number;
}

export interface BriefPayload {
  kind: "morning" | "evening";
  forDate: string;
  weatherLine: string | null;
  earliestCommitment: string | null;
  sections: BriefSection[];
  pushSummary: string;
}

const MAX_LIST_ITEMS = 5;

function sortByTime<T extends { startTime?: string; time?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const ta = a.startTime ?? a.time ?? "";
    const tb = b.startTime ?? b.time ?? "";
    return ta.localeCompare(tb);
  });
}

export function buildMorningBriefPayload(input: MorningBriefInput): BriefPayload {
  const sections: BriefSection[] = [];

  if (input.hasCurrentSemester && input.classes.length > 0) {
    const sorted = sortByTime(input.classes).slice(0, 8);
    sections.push({
      id: "classes",
      title: "Today's Classes",
      linkHref: "/today",
      linkLabel: "View Today",
      totalCount: input.classes.length,
      items: sorted.map((c) => ({
        label: c.courseName,
        meta: `${c.startTime}–${c.endTime}${c.location ? ` · ${c.location}` : ""}`,
        href: `/courses/${c.courseId}`,
      })),
    });
  }

  if (input.events.length > 0) {
    const sorted = sortByTime(input.events).slice(0, 8);
    sections.push({
      id: "events",
      title: "Today's Events",
      linkHref: "/calendar",
      linkLabel: "Calendar",
      totalCount: input.events.length,
      items: sorted.map((e) => ({
        label: e.title,
        meta: `${e.time}${e.location ? ` · ${e.location}` : ""}`,
        href: "/calendar",
      })),
    });
  }

  if (input.tasks.length > 0) {
    const top = input.tasks.slice(0, MAX_LIST_ITEMS);
    sections.push({
      id: "tasks",
      title: `Tasks Due & Overdue (${input.tasks.length})`,
      linkHref: "/tasks",
      linkLabel: "All Tasks",
      totalCount: input.tasks.length,
      items: top.map((t) => ({
        label: t.title,
        meta: `${t.isOverdue ? "Overdue" : "Due today"}${t.courseName ? ` · ${t.courseName}` : ""}`,
        href: "/tasks",
      })),
    });
  }

  if (input.travel.length > 0) {
    sections.push({
      id: "travel",
      title: "Upcoming Travel (48h)",
      linkHref: "/calendar",
      linkLabel: "Calendar",
      totalCount: input.travel.length,
      items: input.travel.slice(0, MAX_LIST_ITEMS).map((tr) => ({
        label: tr.title,
        meta: `${tr.dateTimeLabel}${tr.location ? ` · ${tr.location}` : ""}`,
        href: "/calendar",
        documents: tr.documents,
      })),
    });
  }

  if (
    input.dsaSummary &&
    input.dsaSummary.isConfigured &&
    (input.dsaSummary.dueToday > 0 || input.dsaSummary.overdue > 0)
  ) {
    sections.push({
      id: "dsa",
      title: "DSA Revisions",
      linkHref: "/dsa/revision",
      linkLabel: "Revision Queue",
      items: [
        {
          label: `${input.dsaSummary.dueToday} due today · ${input.dsaSummary.overdue} overdue`,
          meta:
            input.dsaSummary.topOverdue.length > 0
              ? `Top overdue: ${input.dsaSummary.topOverdue.join(", ")}`
              : undefined,
          href: "/dsa/revision",
        },
      ],
    });
  }

  if (input.assessments.length > 0) {
    sections.push({
      id: "assessments",
      title: "Assessments (Next 3 Days)",
      linkHref: "/today",
      linkLabel: "Courses",
      totalCount: input.assessments.length,
      items: input.assessments.slice(0, MAX_LIST_ITEMS).map((a) => ({
        label: a.title,
        meta: `${a.courseName} · ${a.dueDate}`,
      })),
    });
  }

  const parts: string[] = [];
  if (input.hasCurrentSemester && input.classes.length > 0) {
    parts.push(`${input.classes.length} class${input.classes.length === 1 ? "" : "es"}`);
  }
  if (input.tasks.length > 0) {
    parts.push(`${input.tasks.length} task${input.tasks.length === 1 ? "" : "s"}`);
  }
  if (input.events.length > 0) {
    parts.push(`${input.events.length} event${input.events.length === 1 ? "" : "s"}`);
  }
  if (input.dsaSummary && (input.dsaSummary.dueToday > 0 || input.dsaSummary.overdue > 0)) {
    parts.push(`${input.dsaSummary.dueToday + input.dsaSummary.overdue} DSA due`);
  }
  const pushSummary =
    parts.length > 0
      ? `Today: ${parts.join(", ")}.`
      : "Clear schedule today — open your morning brief.";

  return {
    kind: "morning",
    forDate: input.forDate,
    weatherLine: input.weatherLine ?? null,
    earliestCommitment: null,
    sections,
    pushSummary,
  };
}

export function buildEveningBriefPayload(input: EveningBriefInput): BriefPayload {
  const sections: BriefSection[] = [];

  if (input.hasCurrentSemester && input.unmarkedTodayCount > 0) {
    sections.push({
      id: "unmarked_attendance",
      title: "Unmarked Attendance Today",
      linkHref: "/today",
      linkLabel: "Mark Attendance",
      totalCount: input.unmarkedTodayCount,
      items: [
        {
          label: `${input.unmarkedTodayCount} class${input.unmarkedTodayCount === 1 ? "" : "es"} still unmarked`,
          href: "/today",
        },
      ],
    });
  }

  const tomorrowCommitments: Array<{ time: string; label: string; meta: string; href: string }> = [];
  if (input.hasCurrentSemester) {
    for (const c of input.tomorrowClasses) {
      tomorrowCommitments.push({
        time: c.startTime,
        label: c.courseName,
        meta: `${c.startTime}–${c.endTime}${c.location ? ` · ${c.location}` : ""}`,
        href: `/courses/${c.courseId}`,
      });
    }
  }
  for (const e of input.tomorrowEvents) {
    tomorrowCommitments.push({
      time: e.time,
      label: e.title,
      meta: `${e.time}${e.location ? ` · ${e.location}` : ""}`,
      href: "/calendar",
    });
  }
  tomorrowCommitments.sort((a, b) => a.time.localeCompare(b.time));

  const earliestCommitment =
    tomorrowCommitments.length > 0
      ? `${tomorrowCommitments[0].time} · ${tomorrowCommitments[0].label}`
      : null;

  if (tomorrowCommitments.length > 0) {
    sections.push({
      id: "tomorrow_schedule",
      title: "Tomorrow's Schedule",
      linkHref: "/calendar",
      linkLabel: "Calendar",
      totalCount: tomorrowCommitments.length,
      items: tomorrowCommitments.slice(0, 8).map((c) => ({
        label: c.label,
        meta: c.meta,
        href: c.href,
      })),
    });
  }

  if (input.tasksDueTomorrow.length > 0) {
    sections.push({
      id: "tasks_tomorrow",
      title: `Tasks Due Tomorrow (${input.tasksDueTomorrow.length})`,
      linkHref: "/tasks",
      linkLabel: "Tasks",
      totalCount: input.tasksDueTomorrow.length,
      items: input.tasksDueTomorrow.slice(0, MAX_LIST_ITEMS).map((t) => ({
        label: t.title,
        meta: t.courseName ?? undefined,
        href: "/tasks",
      })),
    });
  }

  if (input.assessmentsWithin7Days.length > 0) {
    sections.push({
      id: "assessments_7d",
      title: "Assessments (Next 7 Days)",
      linkHref: "/today",
      linkLabel: "Courses",
      totalCount: input.assessmentsWithin7Days.length,
      items: input.assessmentsWithin7Days.slice(0, MAX_LIST_ITEMS).map((a) => ({
        label: a.title,
        meta: `${a.courseName} · ${a.dueDate}`,
      })),
    });
  }

  if (input.travelTomorrow.length > 0) {
    sections.push({
      id: "travel_tomorrow",
      title: "Travel Tomorrow",
      linkHref: "/calendar",
      linkLabel: "Calendar",
      totalCount: input.travelTomorrow.length,
      items: input.travelTomorrow.slice(0, MAX_LIST_ITEMS).map((tr) => ({
        label: tr.title,
        meta: `${tr.dateTimeLabel}${tr.location ? ` · ${tr.location}` : ""}`,
        href: "/calendar",
        documents: tr.documents,
      })),
    });
  }

  if (input.tomorrowDsaDueCount > 0) {
    sections.push({
      id: "dsa_tomorrow",
      title: "DSA Revisions Tomorrow",
      linkHref: "/dsa/revision",
      linkLabel: "Revision Queue",
      items: [
        {
          label: `${input.tomorrowDsaDueCount} revision${input.tomorrowDsaDueCount === 1 ? "" : "s"} due tomorrow`,
          href: "/dsa/revision",
        },
      ],
    });
  }

  const summaryBits: string[] = [];
  if (earliestCommitment) summaryBits.push(`First up ${earliestCommitment}`);
  if (input.hasCurrentSemester && input.unmarkedTodayCount > 0) {
    summaryBits.push(`${input.unmarkedTodayCount} unmarked today`);
  }
  if (input.tasksDueTomorrow.length > 0) {
    summaryBits.push(`${input.tasksDueTomorrow.length} task${input.tasksDueTomorrow.length === 1 ? "" : "s"} tomorrow`);
  }
  const pushSummary =
    summaryBits.length > 0
      ? `${summaryBits.join(" · ")}.`
      : "Tomorrow looks open — review your evening brief.";

  return {
    kind: "evening",
    forDate: input.forDate,
    weatherLine: input.weatherLine ?? null,
    earliestCommitment,
    sections,
    pushSummary,
  };
}
