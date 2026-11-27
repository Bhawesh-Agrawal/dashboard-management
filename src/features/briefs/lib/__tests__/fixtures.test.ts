import { describe, expect, it, vi } from "vitest";
import { buildBriefPayloadV2 } from "../sections";
import { narrateBrief } from "../narrate";
import type { BriefPayloadV2, BriefWeatherV2 } from "../payload-v2";

function renderBriefText(p: BriefPayloadV2): string {
  const lines: string[] = [
    `[${p.kind.toUpperCase()} · ${p.forDate}] ${p.headline?.text ?? ""} (${p.headline?.source ?? "none"})`,
    `Summary: ${p.summary ?? ""}`,
  ];
  if (p.nextUp) {
    lines.push(`NextUp: ${p.nextUp.title} at ${p.nextUp.startsAt} (in ${p.nextUp.minutesRemaining}m)`);
  }
  if (p.weather) {
    lines.push(
      `Weather: ${p.weather.summaryLine ?? "N/A"} | Advice: ${p.weather.adviceLine ?? "none"} | AQI: ${p.weather.aqi ? `${p.weather.aqi.usAqi} ${p.weather.aqi.category}` : "none"} | Unavailable: ${p.weather.unavailableNote ?? "none"}`
    );
  } else {
    lines.push("Weather: none");
  }
  lines.push(`Timeline (${p.timeline?.length ?? 0}): ${(p.timeline ?? []).map((t) => `${t.startTime} ${t.title}`).join(" | ")}`);
  if (p.deadlines) {
    lines.push(
      `Deadlines: today=${p.deadlines.tasksToday.length}, overdue=${p.deadlines.overdueTotalCount}, 3d=${p.deadlines.tasksWithin3Days.length}, exams=${p.deadlines.assessmentsWithin7Days.length}`
    );
  }
  if (p.travel && p.travel.length > 0) {
    lines.push(
      `Travel: ${p.travel.map((t) => `${t.title} (${t.destinationWeather?.summary ?? "no dest weather"}, tickets=${t.documents.length})`).join("; ")}`
    );
  }
  if (p.nudges && p.nudges.length > 0) {
    lines.push(`Nudges: ${p.nudges.map((n) => `${n.kind}: ${n.message}`).join(" | ")}`);
  }
  return lines.join("\n");
}

const clearWeather: BriefWeatherV2 = {
  locationName: "Kathmandu",
  currentTempC: 18,
  feelsLikeC: 18,
  tempMinC: 12,
  tempMaxC: 22,
  sunrise: "06:34",
  sunset: "17:12",
  uvIndexMax: 4,
  windSpeedMaxKmh: 10,
  visibilityMinKm: 10,
  rainWindows: [],
  bestHours: "Best around 10:00 (19°C)",
  worstHours: "Worst around 16:00 (0% rain)",
  fogNote: null,
  aqi: { usAqi: 42, pm25: 9.2, category: "Good", advice: "Air quality is clean; great for outdoor activity." },
  adviceLine: "Pack a jacket — low near 12°C.",
  hourly: [{ time: "09:00", tempC: 16, apparentTempC: 16, precipProb: 0, weatherCode: 1 }],
  unavailableNote: null,
  summaryLine: "Kathmandu: Mainly clear, 12°–22°C",
};

describe("Brief v2 scenario snapshots (Item 9)", () => {
  it("1. busy class day", () => {
    const payload = buildBriefPayloadV2({
      kind: "morning",
      forDate: "2026-11-27",
      nowHm: "07:30",
      generatedAt: "2026-11-27T07:30:00.000Z",
      hasCurrentSemester: true,
      classes: [
        { courseId: "c1", courseName: "Algorithms", startTime: "09:00", endTime: "10:00", location: "LH-1" },
        { courseId: "c2", courseName: "OS", startTime: "11:30", endTime: "12:30", location: "LH-2" },
        { courseId: "c3", courseName: "Networks", startTime: "14:00", endTime: "15:00", location: "Lab-3" },
      ],
      events: [{ id: "e1", title: "Club Sync", time: "16:30", date: "2026-11-27" }],
      googleEvents: [{ id: "g1", title: "Dentist", time: "18:00", endTime: "18:30", date: "2026-11-27", calendarName: "Personal" }],
      tasksToday: [{ id: "t1", title: "Lab 4", dueDate: "2026-11-27", isOverdue: false }],
      overdueTasks: [],
      tasksWithin3Days: [],
      assessmentsWithin7Days: [],
      travel: [],
      weather: clearWeather,
    });
    expect({ payload, rendered: renderBriefText(payload) }).toMatchSnapshot();
  });

  it("2. empty day with semester ended", () => {
    const payload = buildBriefPayloadV2({
      kind: "morning",
      forDate: "2026-11-27",
      nowHm: "08:00",
      generatedAt: "2026-11-27T08:00:00.000Z",
      hasCurrentSemester: false,
      classes: [],
      events: [],
      tasksToday: [],
      overdueTasks: [],
      tasksWithin3Days: [],
      assessmentsWithin7Days: [],
      travel: [],
      recentNotes: [{ id: "n1", title: "Graph Theory", updatedAt: "2026-11-26", href: "/notes/n1" }],
      weather: clearWeather,
      nudgeContext: {
        hasCurrentSemester: false,
        lastEndedSemester: { name: "Semester 3", endDate: "2026-11-15" },
        hasPushSubscription: true,
        hasCitySet: true,
        googleCalendarConnected: true,
        dsaBankCount: 25,
      },
    });
    expect({ payload, rendered: renderBriefText(payload) }).toMatchSnapshot();
  });

  it("3. exam week", () => {
    const payload = buildBriefPayloadV2({
      kind: "morning",
      forDate: "2026-11-27",
      nowHm: "07:00",
      generatedAt: "2026-11-27T07:00:00.000Z",
      hasCurrentSemester: true,
      classes: [],
      events: [],
      tasksToday: [{ id: "t1", title: "Revise Ch 5", dueDate: "2026-11-27", isOverdue: false }],
      overdueTasks: [{ id: "t2", title: "Past paper 2024", dueDate: "2026-11-25", isOverdue: true }],
      tasksWithin3Days: [{ id: "t3", title: "Formula sheet", dueDate: "2026-11-29", isOverdue: false }],
      assessmentsWithin7Days: [
        { id: "a1", title: "end sem", courseName: "Algorithms", dueDate: "2026-11-29" },
        { id: "a2", title: "end sem", courseName: "DBMS", dueDate: "2026-12-01" },
      ],
      travel: [],
      weather: clearWeather,
    });
    expect({ payload, rendered: renderBriefText(payload) }).toMatchSnapshot();
  });

  it("4. travel day with a ticket and destination weather", () => {
    const payload = buildBriefPayloadV2({
      kind: "morning",
      forDate: "2026-11-27",
      nowHm: "06:30",
      generatedAt: "2026-11-27T06:30:00.000Z",
      hasCurrentSemester: false,
      classes: [],
      events: [{ id: "e1", title: "Flight to Pokhara", time: "10:15", date: "2026-11-27", location: "Pokhara" }],
      tasksToday: [],
      overdueTasks: [],
      tasksWithin3Days: [],
      assessmentsWithin7Days: [],
      travel: [
        {
          eventId: "e1",
          title: "Flight to Pokhara",
          dateTimeLabel: "2026-11-27 10:15",
          location: "Pokhara",
          documents: [{ noteId: "doc-1", title: "BoardingPass.pdf", offlineUrl: "/notes/doc-1" }],
          destinationWeather: {
            location: "Pokhara",
            dateOnly: "2026-11-27",
            tempMinC: 13,
            tempMaxC: 24,
            precipProbMax: 10,
            summary: "Pokhara: Mainly clear, 13°–24°C · 10% rain",
          },
          ticketsPinnedCount: 1,
        },
      ],
      weather: clearWeather,
    });
    expect({ payload, rendered: renderBriefText(payload) }).toMatchSnapshot();
  });

  it("5. rainy day with unhealthy AQI", () => {
    const rainyAqi: BriefWeatherV2 = {
      ...clearWeather,
      rainWindows: ["likely 15:00 to 18:00"],
      aqi: {
        usAqi: 175,
        pm25: 88.5,
        category: "Unhealthy",
        advice: "Wear a mask outdoors and limit prolonged exertion.",
      },
      adviceLine: "Wear a mask outdoors (AQI 175 · Unhealthy).",
      summaryLine: "Kathmandu: Rain, 12°–19°C",
    };
    const payload = buildBriefPayloadV2({
      kind: "morning",
      forDate: "2026-11-27",
      nowHm: "07:30",
      generatedAt: "2026-11-27T07:30:00.000Z",
      hasCurrentSemester: true,
      classes: [{ courseId: "c1", courseName: "Compilers", startTime: "10:00", endTime: "11:00" }],
      events: [],
      tasksToday: [],
      overdueTasks: [],
      tasksWithin3Days: [],
      assessmentsWithin7Days: [],
      travel: [],
      weather: rainyAqi,
    });
    expect({ payload, rendered: renderBriefText(payload) }).toMatchSnapshot();
  });

  it("6. weather API down", () => {
    const downWeather: BriefWeatherV2 = {
      locationName: "Kathmandu",
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
      unavailableNote: "Forecast unavailable · Air quality unavailable",
      summaryLine: null,
    };
    const payload = buildBriefPayloadV2({
      kind: "morning",
      forDate: "2026-11-27",
      nowHm: "07:30",
      generatedAt: "2026-11-27T07:30:00.000Z",
      hasCurrentSemester: true,
      classes: [{ courseId: "c1", courseName: "Databases", startTime: "09:00", endTime: "10:00" }],
      events: [],
      tasksToday: [],
      overdueTasks: [],
      tasksWithin3Days: [],
      assessmentsWithin7Days: [],
      travel: [],
      weather: downWeather,
    });
    expect({ payload, rendered: renderBriefText(payload) }).toMatchSnapshot();
  });

  it("7. AI down (fallback headline)", async () => {
    const base = buildBriefPayloadV2({
      kind: "morning",
      forDate: "2026-11-27",
      nowHm: "07:30",
      generatedAt: "2026-11-27T07:30:00.000Z",
      hasCurrentSemester: true,
      classes: [{ courseId: "c1", courseName: "Databases", startTime: "09:00", endTime: "10:00" }],
      events: [],
      tasksToday: [],
      overdueTasks: [],
      tasksWithin3Days: [],
      assessmentsWithin7Days: [],
      travel: [],
      weather: clearWeather,
    });
    const narrated = await narrateBrief(base, {
      llmCall: vi.fn().mockRejectedValue(new Error("OpenRouter 503")),
    });
    const payload: BriefPayloadV2 = {
      ...base,
      headline: narrated.headline,
      summary: narrated.summary,
    };
    expect({ payload, rendered: renderBriefText(payload) }).toMatchSnapshot();
  });

  it("8. morning vs evening vs midday", () => {
    const classes = [
      { courseId: "c1", courseName: "Morning Class", startTime: "09:00", endTime: "10:00" },
      { courseId: "c2", courseName: "Afternoon Lab", startTime: "14:00", endTime: "16:00" },
    ];
    const morning = buildBriefPayloadV2({
      kind: "morning",
      forDate: "2026-11-27",
      nowHm: "07:00",
      generatedAt: "2026-11-27T07:00:00.000Z",
      hasCurrentSemester: true,
      classes,
      events: [],
      tasksToday: [],
      overdueTasks: [],
      tasksWithin3Days: [],
      assessmentsWithin7Days: [],
      travel: [],
    });
    const midday = buildBriefPayloadV2({
      kind: "midday",
      forDate: "2026-11-27",
      nowHm: "13:00",
      generatedAt: "2026-11-27T13:00:00.000Z",
      hasCurrentSemester: true,
      classes,
      events: [],
      tasksToday: [],
      overdueTasks: [],
      tasksWithin3Days: [],
      assessmentsWithin7Days: [],
      travel: [],
    });
    const evening = buildBriefPayloadV2({
      kind: "evening",
      forDate: "2026-11-28",
      nowHm: "20:30",
      generatedAt: "2026-11-27T20:30:00.000Z",
      hasCurrentSemester: true,
      unmarkedTodayCount: 1,
      classes,
      events: [],
      tasksToday: [],
      overdueTasks: [],
      tasksWithin3Days: [],
      assessmentsWithin7Days: [],
      travel: [],
    });
    expect({
      morning: renderBriefText(morning),
      midday: renderBriefText(midday),
      evening: renderBriefText(evening),
    }).toMatchSnapshot();
  });

  it("9. no city set", () => {
    const payload = buildBriefPayloadV2({
      kind: "morning",
      forDate: "2026-11-27",
      nowHm: "07:30",
      generatedAt: "2026-11-27T07:30:00.000Z",
      hasCurrentSemester: true,
      classes: [],
      events: [],
      tasksToday: [],
      overdueTasks: [],
      tasksWithin3Days: [],
      assessmentsWithin7Days: [],
      travel: [],
      weather: null,
      nudgeContext: {
        hasCurrentSemester: true,
        hasPushSubscription: true,
        hasCitySet: false,
        googleCalendarConnected: true,
        dsaBankCount: 10,
      },
    });
    expect({ payload, rendered: renderBriefText(payload) }).toMatchSnapshot();
  });
});
