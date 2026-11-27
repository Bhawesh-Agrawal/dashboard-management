import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchDestinationWeather,
  fetchRichWeather,
  fetchWeatherLine,
  searchCities,
} from "../weather";

const cacheMap = new Map<string, { cacheKey: string; summary: string; fetchedAt: Date }>();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    weatherCache: {
      findUnique: vi.fn(async ({ where }: { where: { cacheKey: string } }) => {
        return cacheMap.get(where.cacheKey) ?? null;
      }),
      upsert: vi.fn(
        async ({
          where,
          create,
        }: {
          where: { cacheKey: string };
          create: { cacheKey: string; summary: string; fetchedAt: Date };
        }) => {
          cacheMap.set(where.cacheKey, create);
          return create;
        }
      ),
    },
  },
}));

describe("Weather & Location (Open-Meteo, Step 7 + Phase 6 Rich Weather)", () => {
  beforeEach(() => {
    cacheMap.clear();
  });

  it("searches cities via injected fetcher", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              id: 1,
              name: "Kathmandu",
              country: "Nepal",
              admin1: "Bagmati",
              latitude: 27.7,
              longitude: 85.3,
            },
          ],
        }),
        { status: 200 }
      )
    );

    const results = await searchCities("Kath", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Kathmandu");
    expect(results[0].latitude).toBe(27.7);
  });

  it("fetches weather, caches in DB for 3 hours, and reuses cache on repeat call", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          daily: {
            weather_code: [2],
            temperature_2m_min: [11.2],
            temperature_2m_max: [21.6],
            precipitation_probability_max: [20],
          },
        }),
        { status: 200 }
      )
    );

    const now = new Date("2026-11-25T02:00:00.000Z");
    const first = await fetchWeatherLine({
      latitude: 27.7172,
      longitude: 85.324,
      dateOnly: "2026-11-25",
      locationName: "Kathmandu",
      now,
      fetcher,
    });
    expect(first).toBe("Kathmandu: Partly cloudy, 11°–22°C · 20% rain");
    expect(fetcher).toHaveBeenCalledTimes(1);

    // 1 hour later -> served from DB cache without network call
    const second = await fetchWeatherLine({
      latitude: 27.7172,
      longitude: 85.324,
      dateOnly: "2026-11-25",
      locationName: "Kathmandu",
      now: new Date(now.getTime() + 60 * 60 * 1000),
      fetcher,
    });
    expect(second).toBe(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("returns null gracefully on HTTP error or timeout", async () => {
    const failingFetcher = vi.fn().mockRejectedValue(new Error("Network timeout"));
    const res = await fetchWeatherLine({
      latitude: 27.7,
      longitude: 85.3,
      dateOnly: "2026-11-25",
      fetcher: failingFetcher,
    });
    expect(res).toBeNull();
  });

  it("fetches rich forecast + AQI, derives rain windows, fog note, and advice", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("air-quality-api.open-meteo.com")) {
        return new Response(
          JSON.stringify({
            current: { us_aqi: 168, pm2_5: 72.4 },
          }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          current: { temperature_2m: 14.2, apparent_temperature: 12.8, weather_code: 45 },
          daily: {
            weather_code: [61],
            temperature_2m_max: [19.5],
            temperature_2m_min: [10.4],
            sunrise: ["2026-11-27T06:34"],
            sunset: ["2026-11-27T17:12"],
            uv_index_max: [4.2],
            wind_speed_10m_max: [14],
          },
          hourly: {
            time: [
              "2026-11-27T09:00",
              "2026-11-27T15:00",
              "2026-11-27T16:00",
              "2026-11-27T17:00",
            ],
            temperature_2m: [15, 17, 16, 15],
            apparent_temperature: [14, 16, 15, 14],
            precipitation_probability: [10, 70, 80, 60],
            weather_code: [45, 61, 63, 61],
            visibility: [800, 6000, 5000, 7000],
            wind_speed_10m: [5, 12, 14, 10],
          },
        }),
        { status: 200 }
      );
    });

    const weather = await fetchRichWeather({
      latitude: 27.71,
      longitude: 85.32,
      dateOnly: "2026-11-27",
      locationName: "Kathmandu",
      now: new Date("2026-11-27T07:00:00.000Z"),
      fetcher,
    });

    expect(weather.currentTempC).toBe(14.2);
    expect(weather.feelsLikeC).toBe(12.8);
    expect(weather.sunrise).toBe("06:34");
    expect(weather.sunset).toBe("17:12");
    expect(weather.rainWindows).toEqual(["likely 15:00 to 17:00"]);
    expect(weather.fogNote).toContain("0.8 km");
    expect(weather.aqi?.usAqi).toBe(168);
    expect(weather.aqi?.category).toBe("Unhealthy");
    expect(weather.adviceLine).toContain("Wear a mask");
    expect(weather.unavailableNote).toBeNull();

    // Cached for same (lat, lon, date, hourBucket)
    const cached = await fetchRichWeather({
      latitude: 27.71,
      longitude: 85.32,
      dateOnly: "2026-11-27",
      locationName: "Kathmandu",
      now: new Date("2026-11-27T07:30:00.000Z"),
      fetcher,
    });
    expect(cached.aqi?.usAqi).toBe(168);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("returns partial weather with unavailable note when forecast fails", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("air-quality-api.open-meteo.com")) {
        return new Response(
          JSON.stringify({ current: { us_aqi: 42, pm2_5: 8.1 } }),
          { status: 200 }
        );
      }
      throw new Error("Forecast timeout");
    });

    const weather = await fetchRichWeather({
      latitude: 27.71,
      longitude: 85.32,
      dateOnly: "2026-11-27",
      now: new Date("2026-11-27T08:00:00.000Z"),
      fetcher,
    });

    expect(weather.aqi?.category).toBe("Good");
    expect(weather.unavailableNote).toBe("Forecast unavailable");
  });

  it("geocodes and fetches destination weather for travel locations", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("geocoding-api.open-meteo.com")) {
        return new Response(
          JSON.stringify({
            results: [{ id: 2, name: "Pokhara", latitude: 28.2, longitude: 83.98 }],
          }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          daily: {
            weather_code: [1],
            temperature_2m_min: [12],
            temperature_2m_max: [23],
            precipitation_probability_max: [10],
          },
        }),
        { status: 200 }
      );
    });

    const dest = await fetchDestinationWeather({
      location: "Pokhara",
      dateOnly: "2026-11-28",
      fetcher,
    });
    expect(dest?.location).toBe("Pokhara");
    expect(dest?.summary).toBe("Pokhara: Mainly clear, 12°–23°C · 10% rain");

    const missing = await fetchDestinationWeather({
      location: "X",
      dateOnly: "2026-11-28",
      fetcher,
    });
    expect(missing).toBeNull();
  });
});
