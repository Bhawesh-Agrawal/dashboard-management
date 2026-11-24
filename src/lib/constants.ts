// Muted course color palette
export const COURSE_COLORS = [
  { name: "Slate Blue", value: "#6B7FA3" },
  { name: "Sage Green", value: "#7A9E7E" },
  { name: "Dusty Rose", value: "#C4868C" },
  { name: "Amber", value: "#C49B5C" },
  { name: "Lavender", value: "#9B8EC4" },
  { name: "Teal", value: "#5C9E9E" },
  { name: "Coral", value: "#D4845C" },
  { name: "Slate", value: "#7A8B99" },
] as const;

// Accent presets for theme customization (matches course colors)
export const ACCENT_PRESETS = [
  { name: "Default", value: null, cssVar: "" },
  { name: "Slate Blue", value: "slate-blue", cssVar: "#6B7FA3" },
  { name: "Sage Green", value: "sage-green", cssVar: "#7A9E7E" },
  { name: "Dusty Rose", value: "dusty-rose", cssVar: "#C4868C" },
  { name: "Amber", value: "amber", cssVar: "#C49B5C" },
  { name: "Lavender", value: "lavender", cssVar: "#9B8EC4" },
  { name: "Teal", value: "teal", cssVar: "#5C9E9E" },
  { name: "Coral", value: "coral", cssVar: "#D4845C" },
  { name: "Slate", value: "slate", cssVar: "#7A8B99" },
] as const;

// Default grading config: marks% → grade point (10-point scale)
// Professors can override per course via /settings
export const DEFAULT_GRADING_CONFIG = [
  { minPercent: 90, gradePoint: 10 },
  { minPercent: 80, gradePoint: 9 },
  { minPercent: 70, gradePoint: 8 },
  { minPercent: 60, gradePoint: 7 },
  { minPercent: 50, gradePoint: 6 },
  { minPercent: 40, gradePoint: 5 },
  { minPercent: 0, gradePoint: 0 },
] as const;

// Default attendance-to-marks table (out of 5)
export const DEFAULT_ATTENDANCE_MARKS_CONFIG = [
  { minPercent: 95, marks: 5 },
  { minPercent: 90, marks: 3 },
  { minPercent: 85, marks: 2 },
  { minPercent: 80, marks: 1 },
  { minPercent: 0, marks: 0 },
] as const;

// Day of week display names
export const DAY_NAMES = {
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
  SUN: "Sunday",
} as const;

// Short day names for calendar
export const DAY_SHORT = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
  SUN: "Sun",
} as const;
