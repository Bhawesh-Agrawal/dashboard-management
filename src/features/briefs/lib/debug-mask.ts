import { isBriefPayloadV2, type AnyBriefPayload } from "./payload-v2";

function maskId(id: string | undefined): string | undefined {
  if (!id) return undefined;
  return `id_${id.slice(0, 4)}***`;
}

function maskText(text: string | null | undefined, label: string): string | null | undefined {
  if (text === undefined) return undefined;
  if (text === null) return null;
  return `[${label}:${text.length}ch]`;
}

/**
 * Strip personal titles, names, locations, emails, and IDs from a brief payload
 * so it can be safely copied for debugging without leaking user data or secrets.
 */
export function maskBriefPayloadForDebug(payload: AnyBriefPayload): Record<string, unknown> {
  if (!isBriefPayloadV2(payload)) {
    return {
      schemaVersion: 1,
      kind: payload.kind,
      forDate: payload.forDate,
      hasWeather: Boolean(payload.weatherLine),
      sectionCount: payload.sections.length,
      sectionIds: payload.sections.map((s) => s.id),
    };
  }

  return {
    schemaVersion: payload.schemaVersion,
    kind: payload.kind,
    forDate: payload.forDate,
    generatedAt: payload.generatedAt,
    isEmptyDay: payload.isEmptyDay,
    unmarkedTodayCount: payload.unmarkedTodayCount ?? 0,
    headlineSource: payload.headline?.source ?? null,
    nextUp: payload.nextUp
      ? {
          kind: payload.nextUp.kind,
          startsAt: payload.nextUp.startsAt,
          minutesRemaining: payload.nextUp.minutesRemaining,
          title: maskText(payload.nextUp.title, "title"),
        }
      : null,
    weather: payload.weather
      ? {
          hasLocation: Boolean(payload.weather.locationName),
          currentTempC: payload.weather.currentTempC,
          tempMinC: payload.weather.tempMinC,
          tempMaxC: payload.weather.tempMaxC,
          hourlyCount: payload.weather.hourly.length,
          rainWindows: payload.weather.rainWindows,
          aqiCategory: payload.weather.aqi?.category ?? null,
          unavailableNote: payload.weather.unavailableNote ?? null,
        }
      : null,
    timelineCount: payload.timeline?.length ?? 0,
    timelineKinds: payload.timeline?.map((t) => ({
      kind: t.kind,
      startTime: t.startTime,
      endTime: t.endTime,
      id: maskId(t.id),
    })),
    deadlines: payload.deadlines
      ? {
          tasksToday: payload.deadlines.tasksToday.length,
          overdueTotalCount: payload.deadlines.overdueTotalCount,
          tasksWithin3Days: payload.deadlines.tasksWithin3Days.length,
          assessmentsWithin7Days: payload.deadlines.assessmentsWithin7Days.length,
        }
      : null,
    travelCount: payload.travel?.length ?? 0,
    study: payload.study
      ? {
          isConfigured: payload.study.isConfigured,
          dueToday: payload.study.dueToday,
          overdue: payload.study.overdue,
          programmeDay: payload.study.programmeDay,
          attemptsLast7Days: payload.study.attemptsLast7Days,
        }
      : null,
    notesCount: payload.notes?.length ?? 0,
    nudges: payload.nudges?.map((n) => n.kind) ?? [],
    quickActionKinds: payload.quickActions?.map((a) => a.kind) ?? [],
  };
}
