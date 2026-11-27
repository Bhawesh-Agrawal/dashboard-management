import { prisma } from "@/lib/prisma";
import { getNow } from "@/lib/clock";
import type {
  BriefAqiInfo,
  BriefDestinationWeather,
  BriefHourlyWeather,
  BriefWeatherV2,
} from "./payload-v2";

export interface CitySearchResult {
  id: number;
  name: string;
  country?: string;
  admin1?: string;
  latitude: number;
  longitude: number;
}

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

const WEATHER_TIMEOUT_MS = 3000;
const WEATHER_CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

const WMO_LABELS: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Dense drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  80: "Rain showers",
  81: "Heavy showers",
  95: "Thunderstorm",
};

function describeWmoCode(code: number | undefined): string {
  if (code === undefined || Number.isNaN(code)) return "Weather";
  return WMO_LABELS[code] ?? `Code ${code}`;
}

function extractHm(isoTimestamp: string | undefined): string | null {
  if (!isoTimestamp) return null;
  const idx = isoTimestamp.indexOf("T");
  if (idx === -1) return null;
  return isoTimestamp.slice(idx + 1, idx + 6);
}

export function classifyUsAqi(usAqi: number, pm25: number): BriefAqiInfo {
  const roundedAqi = Math.round(usAqi);
  const roundedPm = Math.round(pm25 * 10) / 10;

  if (roundedAqi <= 50) {
    return {
      usAqi: roundedAqi,
      pm25: roundedPm,
      category: "Good",
      advice: "Air quality is clean; great for outdoor activity.",
    };
  }
  if (roundedAqi <= 100) {
    return {
      usAqi: roundedAqi,
      pm25: roundedPm,
      category: "Moderate",
      advice: "Acceptable air quality; sensitive individuals should pace exertion.",
    };
  }
  if (roundedAqi <= 150) {
    return {
      usAqi: roundedAqi,
      pm25: roundedPm,
      category: "Unhealthy for Sensitive Groups",
      advice: "Consider a mask if commuting long distances outdoors.",
    };
  }
  if (roundedAqi <= 200) {
    return {
      usAqi: roundedAqi,
      pm25: roundedPm,
      category: "Unhealthy",
      advice: "Wear a mask outdoors and limit prolonged exertion.",
    };
  }
  if (roundedAqi <= 300) {
    return {
      usAqi: roundedAqi,
      pm25: roundedPm,
      category: "Very Unhealthy",
      advice: "Wear an N95 mask outdoors and keep windows closed.",
    };
  }
  return {
    usAqi: roundedAqi,
    pm25: roundedPm,
    category: "Hazardous",
    advice: "Avoid outdoor exposure; wear an N95 mask if you must go out.",
  };
}

export function deriveRainWindows(hourly: BriefHourlyWeather[]): string[] {
  const windows: string[] = [];
  let start: string | null = null;
  let end: string | null = null;

  const flush = () => {
    if (start && end) {
      windows.push(start === end ? `likely around ${start}` : `likely ${start} to ${end}`);
    }
    start = null;
    end = null;
  };

  for (const h of hourly) {
    if (h.precipProb >= 50) {
      if (!start) start = h.time;
      end = h.time;
    } else {
      flush();
    }
  }
  flush();
  return windows;
}

export function deriveBestWorstHours(hourly: BriefHourlyWeather[]): {
  bestHours: string | null;
  worstHours: string | null;
} {
  const daytime = hourly.filter((h) => {
    const hr = Number(h.time.slice(0, 2));
    return hr >= 6 && hr <= 21;
  });
  if (daytime.length === 0) return { bestHours: null, worstHours: null };

  const score = (h: BriefHourlyWeather) => {
    // Higher is better: penalize rain probability and extreme temperatures
    const tempPenalty = Math.abs(h.apparentTempC - 21) * 1.5;
    return 100 - h.precipProb - tempPenalty;
  };

  let best = daytime[0];
  let worst = daytime[0];
  for (const h of daytime) {
    if (score(h) > score(best)) best = h;
    if (score(h) < score(worst)) worst = h;
  }

  return {
    bestHours: `Best around ${best.time} (${Math.round(best.tempC)}°C)`,
    worstHours:
      worst.time !== best.time
        ? `Worst around ${worst.time} (${Math.round(worst.precipProb)}% rain)`
        : null,
  };
}

export function deriveAdviceLine(input: {
  rainWindows: string[];
  tempMinC: number | null;
  aqi: BriefAqiInfo | null;
  uvIndexMax: number | null;
  fogNote: string | null;
}): string | null {
  if (input.aqi && input.aqi.usAqi >= 151) {
    return `Wear a mask outdoors (AQI ${input.aqi.usAqi} · ${input.aqi.category}).`;
  }
  if (input.rainWindows.length > 0) {
    return `Carry an umbrella — rain ${input.rainWindows[0]}.`;
  }
  if (input.fogNote) {
    return input.fogNote;
  }
  if (input.tempMinC !== null && input.tempMinC <= 14) {
    return `Pack a jacket — low near ${Math.round(input.tempMinC)}°C.`;
  }
  if (input.uvIndexMax !== null && input.uvIndexMax >= 6) {
    return `High UV (${Math.round(input.uvIndexMax)}) — wear sunscreen.`;
  }
  if (input.tempMinC !== null) {
    return "Comfortable conditions — no special gear needed.";
  }
  return null;
}

export async function searchCities(
  query: string,
  fetcher: FetchLike = fetch
): Promise<CitySearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      trimmed
    )}&count=5&language=en&format=json`;
    const res = await fetcher(url, {
      signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: Array<{
        id: number;
        name: string;
        country?: string;
        admin1?: string;
        latitude: number;
        longitude: number;
      }>;
    };
    return (data.results ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      country: r.country,
      admin1: r.admin1,
      latitude: r.latitude,
      longitude: r.longitude,
    }));
  } catch {
    return [];
  }
}

export async function fetchWeatherLine(input: {
  latitude: number;
  longitude: number;
  dateOnly: string; // YYYY-MM-DD
  locationName?: string | null;
  now?: Date;
  fetcher?: FetchLike;
}): Promise<string | null> {
  const now = input.now ?? getNow();
  const fetcher = input.fetcher ?? fetch;
  const cacheKey = `${input.latitude.toFixed(2)}:${input.longitude.toFixed(2)}:${input.dateOnly}`;

  try {
    const cached = await prisma.weatherCache.findUnique({
      where: { cacheKey },
    });
    if (cached && now.getTime() - cached.fetchedAt.getTime() < WEATHER_CACHE_TTL_MS) {
      return cached.summary;
    }
  } catch {
    // Continue without cache on DB read error
  }

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${input.latitude}&longitude=${input.longitude}` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&timezone=auto&start_date=${input.dateOnly}&end_date=${input.dateOnly}`;

    const res = await fetcher(url, {
      signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const json = (await res.json()) as {
      daily?: {
        weather_code?: number[];
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        precipitation_probability_max?: number[];
      };
    };

    const code = json.daily?.weather_code?.[0];
    const tMax = json.daily?.temperature_2m_max?.[0];
    const tMin = json.daily?.temperature_2m_min?.[0];
    const rainProb = json.daily?.precipitation_probability_max?.[0];

    if (tMax === undefined || tMin === undefined) return null;

    const desc = describeWmoCode(code);
    const cityPrefix = input.locationName ? `${input.locationName}: ` : "";
    const rainPart =
      rainProb !== undefined && rainProb > 0 ? ` · ${Math.round(rainProb)}% rain` : "";
    const summary = `${cityPrefix}${desc}, ${Math.round(tMin)}°–${Math.round(tMax)}°C${rainPart}`;

    try {
      await prisma.weatherCache.upsert({
        where: { cacheKey },
        create: { cacheKey, summary, fetchedAt: now },
        update: { summary, fetchedAt: now },
      });
    } catch {
      // Non-critical cache write failure
    }

    return summary;
  } catch {
    return null;
  }
}

interface ForecastApiResponse {
  current?: {
    temperature_2m?: number;
    apparent_temperature?: number;
    weather_code?: number;
  };
  daily?: {
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    sunrise?: string[];
    sunset?: string[];
    uv_index_max?: number[];
    wind_speed_10m_max?: number[];
  };
  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    apparent_temperature?: number[];
    precipitation_probability?: number[];
    weather_code?: number[];
    visibility?: number[];
    wind_speed_10m?: number[];
  };
}

interface AirQualityApiResponse {
  current?: {
    us_aqi?: number;
    pm2_5?: number;
  };
  hourly?: {
    us_aqi?: number[];
    pm2_5?: number[];
  };
}

export async function fetchRichWeather(input: {
  latitude: number;
  longitude: number;
  dateOnly: string; // YYYY-MM-DD
  locationName?: string | null;
  includeAqi?: boolean;
  now?: Date;
  fetcher?: FetchLike;
}): Promise<BriefWeatherV2> {
  const now = input.now ?? getNow();
  const fetcher = input.fetcher ?? fetch;
  const includeAqi = input.includeAqi ?? true;
  const hourBucket = now.getUTCHours();
  const cacheKey = `v2:${input.latitude.toFixed(2)}:${input.longitude.toFixed(2)}:${input.dateOnly}:${hourBucket}:${includeAqi ? "aqi" : "noaqi"}`;

  try {
    const cached = await prisma.weatherCache.findUnique({ where: { cacheKey } });
    if (cached && now.getTime() - cached.fetchedAt.getTime() < WEATHER_CACHE_TTL_MS) {
      const parsed = JSON.parse(cached.summary) as BriefWeatherV2;
      if (parsed && typeof parsed === "object" && "hourly" in parsed) {
        return parsed;
      }
    }
  } catch {
    // Ignore cache read/parse errors
  }

  const forecastUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${input.latitude}&longitude=${input.longitude}` +
    `&current=temperature_2m,apparent_temperature,weather_code` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,wind_speed_10m_max` +
    `&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code,visibility,wind_speed_10m` +
    `&timezone=auto&start_date=${input.dateOnly}&end_date=${input.dateOnly}`;

  const aqiUrl =
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${input.latitude}&longitude=${input.longitude}` +
    `&current=us_aqi,pm2_5&hourly=us_aqi,pm2_5&timezone=auto&forecast_days=2`;

  const fetchForecast = async (): Promise<ForecastApiResponse | null> => {
    try {
      const res = await fetcher(forecastUrl, {
        signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS),
      });
      if (!res.ok) return null;
      return (await res.json()) as ForecastApiResponse;
    } catch {
      return null;
    }
  };

  const fetchAqi = async (): Promise<AirQualityApiResponse | null> => {
    if (!includeAqi) return null;
    try {
      const res = await fetcher(aqiUrl, {
        signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS),
      });
      if (!res.ok) return null;
      return (await res.json()) as AirQualityApiResponse;
    } catch {
      return null;
    }
  };

  const [forecast, airQuality] = await Promise.all([fetchForecast(), fetchAqi()]);

  const unavailableNotes: string[] = [];
  if (!forecast) unavailableNotes.push("Forecast unavailable");
  if (includeAqi && !airQuality) unavailableNotes.push("Air quality unavailable");

  const hourly: BriefHourlyWeather[] = [];
  const times = forecast?.hourly?.time ?? [];
  let minVisMeters: number | null = null;
  let hasFogCode = false;
  let maxHourlyWind: number | null = null;

  for (let i = 0; i < times.length; i++) {
    const hm = extractHm(times[i]);
    if (!hm) continue;
    const tempC = forecast?.hourly?.temperature_2m?.[i];
    const apparentTempC = forecast?.hourly?.apparent_temperature?.[i] ?? tempC;
    const precipProb = forecast?.hourly?.precipitation_probability?.[i] ?? 0;
    const weatherCode = forecast?.hourly?.weather_code?.[i] ?? 0;
    const vis = forecast?.hourly?.visibility?.[i];
    const wind = forecast?.hourly?.wind_speed_10m?.[i];

    if (weatherCode === 45 || weatherCode === 48) hasFogCode = true;
    if (typeof vis === "number") {
      minVisMeters = minVisMeters === null ? vis : Math.min(minVisMeters, vis);
    }
    if (typeof wind === "number") {
      maxHourlyWind = maxHourlyWind === null ? wind : Math.max(maxHourlyWind, wind);
    }

    if (typeof tempC === "number") {
      hourly.push({
        time: hm,
        tempC: Math.round(tempC * 10) / 10,
        apparentTempC: Math.round((apparentTempC ?? tempC) * 10) / 10,
        precipProb: Math.round(precipProb),
        weatherCode,
      });
    }
  }

  const tempMinC = forecast?.daily?.temperature_2m_min?.[0] ?? null;
  const tempMaxC = forecast?.daily?.temperature_2m_max?.[0] ?? null;
  const currentTempC = forecast?.current?.temperature_2m ?? null;
  const feelsLikeC = forecast?.current?.apparent_temperature ?? null;
  const sunrise = extractHm(forecast?.daily?.sunrise?.[0]);
  const sunset = extractHm(forecast?.daily?.sunset?.[0]);
  const uvIndexMax = forecast?.daily?.uv_index_max?.[0] ?? null;
  const windSpeedMaxKmh = forecast?.daily?.wind_speed_10m_max?.[0] ?? maxHourlyWind;
  const visibilityMinKm =
    minVisMeters !== null ? Math.round((minVisMeters / 1000) * 10) / 10 : null;

  const rainWindows = deriveRainWindows(hourly);
  const { bestHours, worstHours } = deriveBestWorstHours(hourly);
  const fogNote =
    hasFogCode || (visibilityMinKm !== null && visibilityMinKm < 1)
      ? `Low visibility (${visibilityMinKm ?? "<1"} km) / fog — allow extra travel time.`
      : visibilityMinKm !== null && visibilityMinKm < 3
      ? `Hazy visibility (${visibilityMinKm} km).`
      : null;

  const rawUsAqi = airQuality?.current?.us_aqi ?? airQuality?.hourly?.us_aqi?.[0];
  const rawPm25 = airQuality?.current?.pm2_5 ?? airQuality?.hourly?.pm2_5?.[0];
  const aqi =
    typeof rawUsAqi === "number"
      ? classifyUsAqi(rawUsAqi, typeof rawPm25 === "number" ? rawPm25 : 0)
      : null;

  const adviceLine = deriveAdviceLine({
    rainWindows,
    tempMinC,
    aqi,
    uvIndexMax,
    fogNote,
  });

  const code = forecast?.current?.weather_code ?? forecast?.daily?.weather_code?.[0];
  const summaryLine =
    tempMinC !== null && tempMaxC !== null
      ? `${input.locationName ? `${input.locationName}: ` : ""}${describeWmoCode(code)}, ${Math.round(tempMinC)}°–${Math.round(tempMaxC)}°C`
      : null;

  const result: BriefWeatherV2 = {
    locationName: input.locationName ?? null,
    currentTempC: currentTempC !== null ? Math.round(currentTempC * 10) / 10 : null,
    feelsLikeC: feelsLikeC !== null ? Math.round(feelsLikeC * 10) / 10 : null,
    tempMinC: tempMinC !== null ? Math.round(tempMinC * 10) / 10 : null,
    tempMaxC: tempMaxC !== null ? Math.round(tempMaxC * 10) / 10 : null,
    sunrise,
    sunset,
    uvIndexMax: uvIndexMax !== null ? Math.round(uvIndexMax * 10) / 10 : null,
    windSpeedMaxKmh: windSpeedMaxKmh !== null ? Math.round(windSpeedMaxKmh) : null,
    visibilityMinKm,
    rainWindows,
    bestHours,
    worstHours,
    fogNote,
    aqi,
    adviceLine,
    hourly,
    unavailableNote: unavailableNotes.length > 0 ? unavailableNotes.join(" · ") : null,
    summaryLine,
  };

  if (forecast || airQuality) {
    try {
      await prisma.weatherCache.upsert({
        where: { cacheKey },
        create: { cacheKey, summary: JSON.stringify(result), fetchedAt: now },
        update: { summary: JSON.stringify(result), fetchedAt: now },
      });
    } catch {
      // Non-critical cache write failure
    }
  }

  return result;
}

/**
 * Geocode a travel destination string via Open-Meteo geocoding and fetch
 * its daily forecast for the travel date. Silently returns null if unresolved.
 */
export async function fetchDestinationWeather(input: {
  location: string;
  dateOnly: string; // YYYY-MM-DD
  now?: Date;
  fetcher?: FetchLike;
}): Promise<BriefDestinationWeather | null> {
  const fetcher = input.fetcher ?? fetch;
  const cities = await searchCities(input.location, fetcher);
  const target = cities[0];
  if (!target) return null;

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${target.latitude}&longitude=${target.longitude}` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&timezone=auto&start_date=${input.dateOnly}&end_date=${input.dateOnly}`;
    const res = await fetcher(url, {
      signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const json = (await res.json()) as {
      daily?: {
        weather_code?: number[];
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        precipitation_probability_max?: number[];
      };
    };
    const tMax = json.daily?.temperature_2m_max?.[0];
    const tMin = json.daily?.temperature_2m_min?.[0];
    if (tMax === undefined || tMin === undefined) return null;
    const code = json.daily?.weather_code?.[0];
    const precipProbMax = json.daily?.precipitation_probability_max?.[0] ?? null;
    const rainPart =
      precipProbMax !== null && precipProbMax > 0 ? ` · ${Math.round(precipProbMax)}% rain` : "";

    return {
      location: target.name,
      dateOnly: input.dateOnly,
      tempMinC: Math.round(tMin),
      tempMaxC: Math.round(tMax),
      precipProbMax: precipProbMax !== null ? Math.round(precipProbMax) : null,
      summary: `${target.name}: ${describeWmoCode(code)}, ${Math.round(tMin)}°–${Math.round(tMax)}°C${rainPart}`,
    };
  } catch {
    return null;
  }
}
