import type { ParsedCalendarEntry } from "./calendar-import";

export type ImportRowFlagCode =
  | "end_before_start"
  | "long_cancelling_range"
  | "extends_past_semester_end"
  | "outside_semester_range"
  | "duplicate_existing";

export interface ImportRowFlag {
  code: ImportRowFlagCode;
  message: string;
}

export interface ExistingCalendarEntryLike {
  startDate: string;
  endDate: string;
  title: string;
}

function daysInclusive(startDate: string, endDate: string): number {
  const s = Date.parse(`${startDate}T00:00:00Z`);
  const e = Date.parse(`${endDate}T00:00:00Z`);
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0;
  return Math.round((e - s) / 86_400_000) + 1;
}

/**
 * Count distinct weekdays (Mon-Fri) covered by cancelling rows.
 */
export function countCancelledWeekdays(
  rows: Array<{ startDate: string; endDate: string; cancelsClasses: boolean }>,
  semesterStartDate?: string,
  semesterEndDate?: string
): number {
  const dates = new Set<string>();
  for (const row of rows) {
    if (!row.cancelsClasses) continue;
    if (!row.startDate || !row.endDate || row.endDate < row.startDate) continue;
    const start =
      semesterStartDate && row.startDate < semesterStartDate
        ? semesterStartDate
        : row.startDate;
    const end =
      semesterEndDate && row.endDate > semesterEndDate
        ? semesterEndDate
        : row.endDate;
    if (end < start) continue;

    const cur = new Date(`${start}T00:00:00Z`);
    const endMs = Date.parse(`${end}T00:00:00Z`);
    let guard = 0;
    while (cur.getTime() <= endMs && guard < 400) {
      const dow = cur.getUTCDay();
      if (dow >= 1 && dow <= 5) {
        dates.add(cur.toISOString().slice(0, 10));
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
      guard++;
    }
  }
  return dates.size;
}

export function evaluateImportRows(
  rows: ParsedCalendarEntry[],
  options: {
    semesterStartDate?: string;
    semesterEndDate?: string;
    existingEntries?: ExistingCalendarEntryLike[];
  }
): {
  flagsByRowId: Record<string, ImportRowFlag[]>;
  defaultExcludedIds: Set<string>;
} {
  const flagsByRowId: Record<string, ImportRowFlag[]> = {};
  const defaultExcludedIds = new Set<string>();
  const existingKeys = new Set(
    (options.existingEntries ?? []).map(
      (e) => `${e.startDate}|${e.endDate}|${e.title.trim().toLowerCase()}`
    )
  );

  for (const row of rows) {
    const flags: ImportRowFlag[] = [];

    if (row.endDate < row.startDate) {
      flags.push({
        code: "end_before_start",
        message: "End date is before start date.",
      });
    }

    const span = daysInclusive(row.startDate, row.endDate);
    if (row.cancelsClasses && span > 21) {
      flags.push({
        code: "long_cancelling_range",
        message: `Cancels classes for ${span} days (> 21 days).`,
      });
    }

    if (
      options.semesterEndDate &&
      row.cancelsClasses &&
      row.endDate > options.semesterEndDate &&
      row.startDate <= options.semesterEndDate
    ) {
      flags.push({
        code: "extends_past_semester_end",
        message: `Extends past semester end (${options.semesterEndDate}).`,
      });
    }

    if (
      options.semesterStartDate &&
      options.semesterEndDate &&
      (row.endDate < options.semesterStartDate || row.startDate > options.semesterEndDate)
    ) {
      flags.push({
        code: "outside_semester_range",
        message: `Outside semester range (${options.semesterStartDate} to ${options.semesterEndDate}).`,
      });
      defaultExcludedIds.add(row.id);
    }

    const key = `${row.startDate}|${row.endDate}|${row.title.trim().toLowerCase()}`;
    if (existingKeys.has(key)) {
      flags.push({
        code: "duplicate_existing",
        message: "Duplicate of an existing calendar entry.",
      });
    }

    if (flags.length > 0) {
      flagsByRowId[row.id] = flags;
    }
  }

  return { flagsByRowId, defaultExcludedIds };
}
