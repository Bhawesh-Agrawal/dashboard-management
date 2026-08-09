"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCENT_PRESETS } from "@/lib/constants";
import { saveThemePreference } from "@/features/dashboard/lib/actions";

export function ThemeCustomizer({
  initialAccentColor,
  initialThemeMode,
}: {
  initialAccentColor: string | null;
  initialThemeMode: string;
}) {
  const { setTheme } = useTheme();
  const [accent, setAccent] = useState<string | null>(initialAccentColor);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Apply accent on mount
    if (accent) {
      document.documentElement.setAttribute("data-accent", accent);
    } else {
      document.documentElement.removeAttribute("data-accent");
    }
  }, [accent]);

  const handleAccentChange = async (value: string | null) => {
    setAccent(value);
    if (value) {
      document.documentElement.setAttribute("data-accent", value);
    } else {
      document.documentElement.removeAttribute("data-accent");
    }
    setSaving(true);
    await saveThemePreference(value, initialThemeMode);
    setSaving(false);
  };

  const handleThemeChange = async (mode: string) => {
    setTheme(mode);
    setSaving(true);
    await saveThemePreference(accent, mode);
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      {/* Accent Color */}
      <div>
        <p className="section-label mb-3">ACCENT COLOR</p>
        <div className="flex flex-wrap gap-3">
          {ACCENT_PRESETS.map((preset) => (
            <button
              key={preset.name}
              onClick={() => handleAccentChange(preset.value)}
              className={cn(
                "relative flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all",
                accent === preset.value
                  ? "border-primary ring-2 ring-primary/20"
                  : "border-border hover:border-muted-foreground/50"
              )}
              title={preset.name}
            >
              {preset.cssVar ? (
                <div
                  className="h-6 w-6 rounded-full"
                  style={{ backgroundColor: preset.cssVar }}
                />
              ) : (
                <div className="h-6 w-6 rounded-full bg-primary" />
              )}
              {accent === preset.value && (
                <Check className="absolute h-4 w-4 text-primary-foreground" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Theme Mode */}
      <div>
        <p className="section-label mb-3">THEME</p>
        <div className="flex gap-1 rounded-lg border border-border p-1 w-fit">
          {(["light", "dark", "system"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => handleThemeChange(mode)}
              className={cn(
                "rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-colors",
                initialThemeMode === mode
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {saving && (
        <p className="text-xs text-muted-foreground">Saving...</p>
      )}
    </div>
  );
}
