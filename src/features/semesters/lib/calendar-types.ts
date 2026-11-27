export const ACADEMIC_CALENDAR_KINDS = [
  "holiday",
  "break",
  "exam_period",
  "no_classes",
  "follows_weekday",
  "note",
] as const;

export type AcademicCalendarKindValue = (typeof ACADEMIC_CALENDAR_KINDS)[number];

export function defaultCancelsClassesForKind(kind: AcademicCalendarKindValue): boolean {
  return (
    kind === "holiday" ||
    kind === "break" ||
    kind === "no_classes" ||
    kind === "exam_period"
  );
}
