import type { DayOfWeek } from "@prisma/client";

export interface TimetableSlotLike {
  id?: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  courseName?: string;
}

export function hmToMinutes(hm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

export function addMinutesToHm(startHm: string, durationMinutes: number): string {
  const start = hmToMinutes(startHm);
  if (start === null) return startHm;
  const total = Math.min(23 * 60 + 59, start + durationMinutes);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function detectSlotOverlaps(
  candidate: TimetableSlotLike,
  existing: TimetableSlotLike[]
): string[] {
  const cStart = hmToMinutes(candidate.startTime);
  const cEnd = hmToMinutes(candidate.endTime);
  if (cStart === null || cEnd === null || cStart >= cEnd) return [];

  const warnings: string[] = [];
  for (const ex of existing) {
    if (candidate.id && ex.id && candidate.id === ex.id) continue;
    if (ex.dayOfWeek !== candidate.dayOfWeek) continue;
    const eStart = hmToMinutes(ex.startTime);
    const eEnd = hmToMinutes(ex.endTime);
    if (eStart === null || eEnd === null) continue;
    if (cStart < eEnd && cEnd > eStart) {
      warnings.push(
        `Overlaps on ${candidate.dayOfWeek} with ${ex.courseName ?? "class"} (${ex.startTime}–${ex.endTime})`
      );
    }
  }
  return warnings;
}
