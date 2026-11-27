import type { AcademicCalendarKindValue } from "./calendar-types";

export interface AuditableCalendarEntry {
  id: string;
  kind: AcademicCalendarKindValue;
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  cancelsClasses: boolean;
  followsWeekday: number | null;
  notes?: string | null;
}

export type CalendarAuditIssueCode =
  | "long_cancelling_range"
  | "past_semester_end"
  | "title_starts_with_date"
  | "single_day_title_mentions_other_date";

export interface CalendarAuditFinding {
  entry: AuditableCalendarEntry;
  issues: Array<{ code: CalendarAuditIssueCode; message: string }>;
  suggestedEndDate?: string;
  suggestedTitle?: string;
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function daysInclusive(startDate: string, endDate: string): number {
  const s = Date.parse(`${startDate}T00:00:00Z`);
  const e = Date.parse(`${endDate}T00:00:00Z`);
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0;
  return Math.round((e - s) / 86_400_000) + 1;
}

const LEADING_DATE_REGEX =
  /^(?:[–\-—]|\bto\b)?\s*(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}\s+[a-zA-Z]+(?:\s+\d{4})?)\s*[:\-–—]?\s*/i;

const EMBEDDED_DATE_REGEX =
  /\b(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(\d{4}))?\b/i;

function cleanTitleText(raw: string): string {
  return raw
    .replace(LEADING_DATE_REGEX, "")
    .replace(
      /\(\s*(exam\s*period|exams?|no\s*classes?|holiday|break|vacation|recess|note|key\s*date)\s*\)/gi,
      ""
    )
    .replace(/^[:\-–—\s]+/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function auditCalendarEntries(
  entries: AuditableCalendarEntry[],
  options?: { semesterEndDate?: string }
): CalendarAuditFinding[] {
  const findings: CalendarAuditFinding[] = [];

  for (const entry of entries) {
    const issues: CalendarAuditFinding["issues"] = [];
    let suggestedEndDate: string | undefined;
    let suggestedTitle: string | undefined;

    const span = daysInclusive(entry.startDate, entry.endDate);
    if (entry.cancelsClasses && span > 21) {
      issues.push({
        code: "long_cancelling_range",
        message: `Cancels classes for ${span} days (> 21 days).`,
      });
    }

    if (options?.semesterEndDate && entry.endDate > options.semesterEndDate) {
      issues.push({
        code: "past_semester_end",
        message: `Ends after semester end (${options.semesterEndDate}).`,
      });
      if (entry.startDate <= options.semesterEndDate) {
        suggestedEndDate = options.semesterEndDate;
      }
    }

    const startsWithDate =
      /^(?:[–\-—]\s*)?(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b)/i.test(
        entry.title.trim()
      );
    if (startsWithDate) {
      issues.push({
        code: "title_starts_with_date",
        message: "Title starts with a date.",
      });
      const cleaned = cleanTitleText(entry.title);
      if (cleaned && cleaned !== entry.title) {
        suggestedTitle = cleaned;
      }
    }

    if (entry.startDate === entry.endDate) {
      const m = EMBEDDED_DATE_REGEX.exec(entry.title);
      if (m) {
        const month = MONTHS[m[2].toLowerCase()];
        const year = m[3] ? Number(m[3]) : Number(entry.startDate.slice(0, 4));
        const day = Number(m[1]);
        if (month && day >= 1 && day <= 31) {
          const parsedIso = `${year}-${pad2(month)}-${pad2(day)}`;
          if (parsedIso !== entry.startDate) {
            issues.push({
              code: "single_day_title_mentions_other_date",
              message: `Single-day entry (${entry.startDate}) mentions ${parsedIso} in title.`,
            });
            if (parsedIso > entry.startDate) {
              suggestedEndDate = parsedIso;
            }
            const cleaned = cleanTitleText(entry.title);
            if (cleaned && cleaned !== entry.title) {
              suggestedTitle = cleaned;
            }
          }
        }
      }
    }

    if (issues.length > 0) {
      findings.push({
        entry,
        issues,
        suggestedEndDate,
        suggestedTitle,
      });
    }
  }

  return findings;
}
