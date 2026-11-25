"use client";

import { useState, useTransition } from "react";
import {
  searchWeatherCitiesAction,
  saveWeatherLocationAction,
} from "@/features/notifications/lib/actions";
import type { CitySearchResult } from "@/features/briefs/lib/weather";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function LocationSettings({
  initialName,
  initialLat,
  initialLon,
}: {
  initialName: string | null;
  initialLat: number | null;
  initialLon: number | null;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CitySearchResult[]>([]);
  const [savedName, setSavedName] = useState<string | null>(initialName);
  const [savedCoords, setSavedCoords] = useState<{ lat: number; lon: number } | null>(
    initialLat !== null && initialLon !== null
      ? { lat: initialLat, lon: initialLon }
      : null
  );
  const [searching, setSearching] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true);
    try {
      const list = await searchWeatherCitiesAction(query);
      setResults(list);
      if (list.length === 0) {
        toast.info("No matching cities found");
      }
    } finally {
      setSearching(false);
    }
  }

  function handleSelect(city: CitySearchResult) {
    const label = [city.name, city.admin1, city.country].filter(Boolean).join(", ");
    startTransition(async () => {
      const res = await saveWeatherLocationAction({
        name: label,
        latitude: city.latitude,
        longitude: city.longitude,
      });
      if (res.success) {
        setSavedName(label);
        setSavedCoords({ lat: city.latitude, lon: city.longitude });
        setResults([]);
        setQuery("");
        toast.success(`Weather location saved: ${label}`);
      } else {
        toast.error("Failed to save weather location");
      }
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3 max-w-xl">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Weather Location</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Used for Open-Meteo forecasts in your morning and evening briefs.
        </p>
      </div>

      {savedName && savedCoords && (
        <div className="text-xs text-foreground">
          Current: <span className="font-medium">{savedName}</span>{" "}
          <span className="text-muted-foreground">
            ({savedCoords.lat.toFixed(2)}, {savedCoords.lon.toFixed(2)})
          </span>
        </div>
      )}

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search city (e.g. Kathmandu)"
          className="flex-1 min-h-[44px] rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground"
        />
        <Button
          type="submit"
          variant="outline"
          disabled={searching || query.trim().length < 2}
          className="min-h-[44px]"
        >
          {searching ? "Searching..." : "Search"}
        </Button>
      </form>

      {results.length > 0 && (
        <div className="divide-y divide-border rounded-lg border border-border bg-background overflow-hidden">
          {results.map((city) => {
            const label = [city.name, city.admin1, city.country].filter(Boolean).join(", ");
            return (
              <button
                key={city.id}
                type="button"
                onClick={() => handleSelect(city)}
                disabled={isPending}
                className="w-full text-left px-3 py-2.5 min-h-[44px] text-sm hover:bg-muted/50 transition-colors flex items-center justify-between gap-2"
              >
                <span className="text-foreground">{label}</span>
                <span className="text-xs text-muted-foreground">
                  {city.latitude.toFixed(2)}, {city.longitude.toFixed(2)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
