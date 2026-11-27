import type { BriefAssessmentItem, BriefPayload, BriefTaskItem, BriefTravelItem } from "./build";

export type BriefKindV2 = "morning" | "midday" | "evening";

export type BriefCardId =
  | "nextUp"
  | "weather"
  | "timeline"
  | "deadlines"
  | "travel"
  | "study"
  | "notes"
  | "nudges"
  | "quickActions";

export const DEFAULT_CARD_ORDER: BriefCardId[] = [
  "nextUp",
  "weather",
  "timeline",
  "deadlines",
  "travel",
  "study",
  "notes",
  "nudges",
  "quickActions",
];

export interface BriefHeadline {
  text: string;
  source: "ai" | "fallback";
}

export interface BriefNextUp {
  title: string;
  kind: "class" | "event" | "deadline";
  startsAt: string; // HH:mm
  minutesRemaining: number;
  location?: string | null;
  href?: string;
}

export interface BriefHourlyWeather {
  time: string; // HH:mm
  tempC: number;
  apparentTempC: number;
  precipProb: number;
  weatherCode: number;
}

export interface BriefDestinationWeather {
  location: string;
  dateOnly: string;
  tempMinC: number;
  tempMaxC: number;
  precipProbMax: number | null;
  summary: string;
}

export interface BriefAqiInfo {
  usAqi: number;
  pm25: number;
  category: string;
  advice: string;
}

export interface BriefWeatherV2 {
  locationName: string | null;
  currentTempC: number | null;
  feelsLikeC: number | null;
  tempMinC: number | null;
  tempMaxC: number | null;
  sunrise: string | null; // HH:mm
  sunset: string | null; // HH:mm
  uvIndexMax: number | null;
  windSpeedMaxKmh: number | null;
  visibilityMinKm: number | null;
  rainWindows: string[];
  bestHours: string | null;
  worstHours: string | null;
  fogNote: string | null;
  aqi: BriefAqiInfo | null;
  adviceLine: string | null;
  hourly: BriefHourlyWeather[];
  destinationForecasts?: BriefDestinationWeather[];
  unavailableNote?: string | null;
  summaryLine: string | null;
}

export interface BriefTimelineItem {
  id: string;
  kind: "class" | "event" | "google_event" | "gap";
  title: string;
  startTime: string; // HH:mm
  endTime?: string; // HH:mm
  durationMinutes?: number;
  location?: string | null;
  href?: string;
  courseId?: string;
  sourceLabel?: string;
}

export interface BriefDeadlines {
  tasksToday: BriefTaskItem[];
  overdueTasks: BriefTaskItem[];
  overdueTotalCount: number;
  tasksWithin3Days: BriefTaskItem[];
  assessmentsWithin7Days: BriefAssessmentItem[];
}

export interface BriefTravelV2Item extends BriefTravelItem {
  destinationWeather?: BriefDestinationWeather | null;
  ticketsPinnedCount?: number;
}

export interface BriefStudy {
  dueToday: number;
  overdue: number;
  topOverdue: string[];
  programmeDay: number | null;
  attemptsLast7Days: number;
  isConfigured: boolean;
}

export interface BriefNoteItem {
  id: string;
  title: string;
  updatedAt: string; // YYYY-MM-DD
  courseName?: string | null;
  href: string;
}

export type BriefNudgeKind =
  | "semester_ended"
  | "no_current_semester"
  | "no_timetable"
  | "notifications_disabled"
  | "no_city"
  | "google_calendar_disconnected"
  | "dsa_bank_empty";

export interface BriefNudgeItem {
  id: string;
  kind: BriefNudgeKind;
  title: string;
  message: string;
  href: string;
  actionLabel: string;
}

export interface BriefQuickAction {
  id: string;
  label: string;
  kind: "mark_attendance" | "log_dsa" | "open_ticket" | "open_task" | "add_semester" | "link";
  href: string;
  courseId?: string;
  classScheduleId?: string;
}

export interface BriefPayloadV2 {
  schemaVersion: 2;
  kind: BriefKindV2;
  forDate: string; // YYYY-MM-DD
  generatedAt: string; // ISO
  isEmptyDay: boolean;
  unmarkedTodayCount?: number;
  headline?: BriefHeadline;
  summary?: string;
  nextUp?: BriefNextUp | null;
  weather?: BriefWeatherV2 | null;
  timeline?: BriefTimelineItem[];
  deadlines?: BriefDeadlines | null;
  travel?: BriefTravelV2Item[];
  study?: BriefStudy | null;
  notes?: BriefNoteItem[];
  nudges?: BriefNudgeItem[];
  quickActions?: BriefQuickAction[];
  pushSummary: string;
}

export type AnyBriefPayload = BriefPayloadV2 | BriefPayload;

export function isBriefPayloadV2(payload: unknown): payload is BriefPayloadV2 {
  return (
    typeof payload === "object" &&
    payload !== null &&
    (payload as { schemaVersion?: unknown }).schemaVersion === 2
  );
}

export function isBriefPayloadV1(payload: unknown): payload is BriefPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    !isBriefPayloadV2(payload) &&
    Array.isArray((payload as { sections?: unknown }).sections)
  );
}

/**
 * Safely parse a stored brief JSON value (v1 or v2).
 * Returns null if the payload is malformed.
 */
export function parseStoredBriefPayload(payload: unknown): AnyBriefPayload | null {
  if (isBriefPayloadV2(payload) || isBriefPayloadV1(payload)) {
    return payload;
  }
  return null;
}

/**
 * Convert a legacy v1 BriefPayload into a minimal v2 fallback representation
 * so callers can always inspect headline/summary safely.
 */
export function upgradeV1ToV2Fallback(v1: BriefPayload): BriefPayloadV2 {
  const headlineText =
    v1.kind === "morning" ? "Morning Brief" : "Evening Brief";
  return {
    schemaVersion: 2,
    kind: v1.kind,
    forDate: v1.forDate,
    generatedAt: new Date(0).toISOString(),
    isEmptyDay: v1.sections.length === 0,
    headline: { text: headlineText, source: "fallback" },
    summary: v1.pushSummary,
    weather: v1.weatherLine
      ? {
          locationName: null,
          currentTempC: null,
          feelsLikeC: null,
          tempMinC: null,
          tempMaxC: null,
          sunrise: null,
          sunset: null,
          uvIndexMax: null,
          windSpeedMaxKmh: null,
          visibilityMinKm: null,
          rainWindows: [],
          bestHours: null,
          worstHours: null,
          fogNote: null,
          aqi: null,
          adviceLine: null,
          hourly: [],
          summaryLine: v1.weatherLine,
        }
      : null,
    pushSummary: v1.pushSummary,
  };
}
