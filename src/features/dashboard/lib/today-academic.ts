import {
  entriesForDate,
  getEntryRangeDay,
  isoWeekdayName,
  type AcademicCalendarEntryItem,
} from "@/features/semesters/lib/academic-calendar-dates";

export interface TodayAcademicSummaryInput {
  entries: AcademicCalendarEntryItem[];
  todayStr: string;
  tomorrowStr: string;
  upcomingSemester?: {
    id: string;
    name: string;
    startDate: string;
    firstClassDate?: string | null;
  } | null;
}

export function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDayEntryLine(
  prefix: "Today" | "Tomorrow",
  entry: AcademicCalendarEntryItem,
  dateStr: string
): string {
  const { day, totalDays } = getEntryRangeDay(entry, dateStr);
  switch (entry.kind) {
    case "holiday":
      return `${prefix}: holiday, ${entry.title}. No classes.`;
    case "no_classes":
      return `${prefix}: no classes (${entry.title}).`;
    case "break":
      return prefix === "Tomorrow" && entry.startDate === dateStr
        ? `Tomorrow: ${entry.title} begins. No classes.`
        : `${prefix}: ${entry.title}. No classes.`;
    case "exam_period":
      if (prefix === "Tomorrow" && entry.startDate === dateStr) {
        return `Tomorrow: ${entry.title} begin.`;
      }
      return totalDays > 1
        ? `${prefix}: ${entry.title} (day ${day} of ${totalDays}). No classes.`
        : `${prefix}: ${entry.title}. No classes.`;
    case "follows_weekday":
      return `${prefix} follows the ${isoWeekdayName(entry.followsWeekday)} timetable.`;
    case "note":
      return `${prefix}: ${entry.title}.`;
  }
}

export function buildTodayAcademicLines(
  input: TodayAcademicSummaryInput
): string[] {
  const lines: string[] = [];
  const todayEntries = entriesForDate(input.entries, input.todayStr);
  const tomorrowEntries = entriesForDate(input.entries, input.tomorrowStr);

  for (const e of todayEntries) {
    lines.push(formatDayEntryLine("Today", e, input.todayStr));
  }
  for (const e of tomorrowEntries) {
    lines.push(formatDayEntryLine("Tomorrow", e, input.tomorrowStr));
  }

  if (input.upcomingSemester) {
    const targetDate =
      input.upcomingSemester.firstClassDate ?? input.upcomingSemester.startDate;
    const diffDays = Math.max(
      0,
      Math.round(
        (Date.parse(`${targetDate}T00:00:00Z`) -
          Date.parse(`${input.todayStr}T00:00:00Z`)) /
          86_400_000
      )
    );
    lines.push(
      `${diffDays} ${diffDays === 1 ? "day" : "days"} to the first class on ${targetDate}.`
    );
  }

  return lines;
}
