import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchWeatherLine, searchCities } from "../weather";

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

describe("Weather & Location (Open-Meteo, Step 7)", () => {
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
});
