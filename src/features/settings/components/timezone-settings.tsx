"use client";

import { useState, useTransition, useMemo } from "react";
import { updateUserTimezoneAction } from "@/features/settings/lib/actions";
import { Check, Globe, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface TimezoneSettingsProps {
  initialTimezone: string;
}

const COMMON_TIMEZONES = [
  { value: "Asia/Kathmandu", label: "Asia/Kathmandu (Nepal Time, UTC+5:45) — Default" },
  { value: "Asia/Kolkata", label: "Asia/Kolkata (India Standard Time, UTC+5:30)" },
];

export function TimezoneSettings({ initialTimezone }: TimezoneSettingsProps) {
  const [selectedZone, setSelectedZone] = useState(initialTimezone || "Asia/Kathmandu");
  const [searchQuery, setSearchQuery] = useState("");
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  // Supported IANA timezones
  const allTimezones = useMemo(() => {
    try {
      if (typeof Intl !== "undefined" && typeof (Intl as any).supportedValuesOf === "function") {
        return (Intl as any).supportedValuesOf("timeZone") as string[];
      }
    } catch {
      // Fallback
    }
    return [
      "Asia/Kathmandu",
      "Asia/Kolkata",
      "Asia/Dubai",
      "Asia/Singapore",
      "Asia/Tokyo",
      "Europe/London",
      "Europe/Berlin",
      "America/New_York",
      "America/Chicago",
      "America/Los_Angeles",
      "Australia/Sydney",
    ];
  }, []);

  const filteredZones = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return allTimezones
      .filter((tz) => tz.toLowerCase().includes(q))
      .slice(0, 10);
  }, [allTimezones, searchQuery]);

  const handleSelect = (tz: string) => {
    setSelectedZone(tz);
    setSearchQuery("");
    startTransition(async () => {
      try {
        await updateUserTimezoneAction(tz);
        setSaved(true);
        toast.success(`Timezone updated to ${tz}`);
        setTimeout(() => setSaved(false), 3000);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to update timezone";
        toast.error(msg);
      }
    });
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Globe className="h-4 w-4" />
        <span>Used for all schedule timings, attendance dates, and notifications.</span>
      </div>

      <div className="space-y-3">
        {/* Preset primary options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {COMMON_TIMEZONES.map((tz) => {
            const isSelected = selectedZone === tz.value;
            return (
              <button
                key={tz.value}
                type="button"
                onClick={() => handleSelect(tz.value)}
                disabled={isPending}
                className={`flex items-start justify-between p-3 rounded-lg border text-left text-xs transition-colors ${
                  isSelected
                    ? "border-primary bg-primary/10 text-primary font-medium ring-1 ring-primary"
                    : "border-border hover:bg-muted/50 text-foreground"
                }`}
              >
                <div>
                  <div className="font-semibold">{tz.value}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{tz.label.split(" — ")[0].replace(tz.value, "")}</div>
                </div>
                {isSelected && <Check className="h-4 w-4 shrink-0 text-primary mt-0.5" />}
              </button>
            );
          })}
        </div>

        {/* Search for other IANA timezones */}
        <div className="space-y-1.5 pt-2">
          <label className="text-xs font-medium text-muted-foreground">Search other IANA timezones</label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="e.g. America/New_York, Europe/London..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {filteredZones.length > 0 && (
            <div className="rounded-lg border border-border bg-card shadow-sm divide-y divide-border overflow-hidden mt-1">
              {filteredZones.map((tz) => (
                <button
                  key={tz}
                  type="button"
                  onClick={() => handleSelect(tz)}
                  disabled={isPending}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-muted transition-colors flex items-center justify-between"
                >
                  <span>{tz}</span>
                  {selectedZone === tz && <Check className="h-3.5 w-3.5 text-primary" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Current active zone display */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
          <span>
            Current: <strong className="font-mono text-foreground">{selectedZone}</strong>
          </span>
          {isPending ? (
            <span className="flex items-center gap-1 text-primary">
              <Loader2 className="h-3 w-3 animate-spin" /> Saving...
            </span>
          ) : saved ? (
            <span className="flex items-center gap-1 text-primary font-medium">
              <Check className="h-3 w-3" /> Saved
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
