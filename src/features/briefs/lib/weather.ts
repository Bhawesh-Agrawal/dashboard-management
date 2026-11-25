import { prisma } from "@/lib/prisma";
import { getNow } from "@/lib/clock";

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
