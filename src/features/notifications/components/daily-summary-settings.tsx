"use client";

import { useState, useTransition, useEffect } from "react";
import { saveDailySummaryPreferences } from "@/features/notifications/lib/actions";
import { Check, Loader2 } from "lucide-react";

type DailySummarySection =
  | "classes"
  | "tasks"
  | "routines"
  | "deadlines"
  | "attendance"
  | "tomorrow_classes";

const sections: {
  id: DailySummarySection;
  label: string;
  description: string;
}[] = [
  {
    id: "classes",
    label: "Today's Classes",
    description: "Show your class schedule for today with times and locations",
  },
  {
    id: "tomorrow_classes",
    label: "Tomorrow's Classes",
    description: "Preview tomorrow's class schedule so you can prepare ahead",
  },
  {
    id: "tasks",
    label: "Pending Tasks",
    description: "Show starred tasks with priorities and due dates",
  },
  {
    id: "routines",
    label: "Routines",
    description: "Show today's routines with completion status and streaks",
  },
  {
    id: "deadlines",
    label: "Upcoming Deadlines",
    description: "Show deadlines coming up in the next 7 days",
  },
  {
    id: "attendance",
    label: "Attendance Alerts",
    description: "Show courses with attendance below 75%",
  },
];

/**
 * Get common timezone options. Includes major IANA timezone identifiers.
 */
const TIMEZONE_OPTIONS = [
  { value: "Asia/Kathmandu", label: "Asia/Kathmandu (NPT, UTC+5:45)" },
  { value: "Asia/Kolkata", label: "Asia/Kolkata (IST, UTC+5:30)" },
  { value: "Asia/Dubai", label: "Asia/Dubai (GST, UTC+4)" },
  { value: "Asia/Shanghai", label: "Asia/Shanghai (CST, UTC+8)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (JST, UTC+9)" },
  { value: "Asia/Singapore", label: "Asia/Singapore (SGT, UTC+8)" },
  { value: "Asia/Dhaka", label: "Asia/Dhaka (BST, UTC+6)" },
  { value: "Europe/London", label: "Europe/London (GMT/BST)" },
  { value: "Europe/Berlin", label: "Europe/Berlin (CET/CEST)" },
  { value: "Europe/Paris", label: "Europe/Paris (CET/CEST)" },
  { value: "America/New_York", label: "America/New_York (EST/EDT)" },
  { value: "America/Chicago", label: "America/Chicago (CST/CDT)" },
  { value: "America/Denver", label: "America/Denver (MST/MDT)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (PST/PDT)" },
  { value: "Australia/Sydney", label: "Australia/Sydney (AEST/AEDT)" },
  { value: "Pacific/Auckland", label: "Pacific/Auckland (NZST/NZDT)" },
];

export function DailySummarySettings({
  initialTime,
  initialSections,
  initialTimezone,
}: {
  initialTime: string;
  initialSections: DailySummarySection[];
  initialTimezone: string;
}) {
  const [time, setTime] = useState(initialTime);
  const [selectedSections, setSelectedSections] =
    useState<DailySummarySection[]>(initialSections);
  const [timezone, setTimezone] = useState(initialTimezone);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  // Detect browser timezone on mount if no timezone was set
  useEffect(() => {
    if (!initialTimezone) {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected) setTimezone(detected);
    }
  }, [initialTimezone]);

  function handleToggleSection(section: DailySummarySection) {
    setSelectedSections((prev) =>
      prev.includes(section)
        ? prev.filter((s) => s !== section)
        : [...prev, section]
    );
  }

  function handleSave() {
    startTransition(async () => {
      await saveDailySummaryPreferences(time, selectedSections, timezone);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  // Check if the user's timezone is in the preset list
  const isCustomTimezone =
    timezone && !TIMEZONE_OPTIONS.some((tz) => tz.value === timezone);

  return (
    <div className="space-y-4">
      <div>
        <p className="section-label mb-2">DIGEST TIME</p>
        <div className="flex items-center gap-3">
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="h-9 w-32 rounded-md border border-input bg-background px-2 text-sm"
          />
          <p className="text-xs text-muted-foreground">
            You&apos;ll receive a daily summary at this time
          </p>
        </div>
      </div>

      <div>
        <p className="section-label mb-2">TIMEZONE</p>
        <div className="flex items-center gap-3">
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="h-9 w-72 rounded-md border border-input bg-background px-2 text-sm"
          >
            {isCustomTimezone && (
              <option value={timezone}>{timezone}</option>
            )}
            {TIMEZONE_OPTIONS.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Notifications are scheduled in your local timezone
          </p>
        </div>
      </div>

      <div>
        <p className="section-label mb-2">SECTIONS</p>
        <div className="space-y-2">
          {sections.map((section) => (
            <label
              key={section.id}
              className="flex items-center gap-3 p-3 rounded-md border border-input hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() => handleToggleSection(section.id)}
            >
              <div
                className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                  selectedSections.includes(section.id)
                    ? "bg-primary border-primary text-primary-foreground"
                    : "border-input"
                }`}
              >
                {selectedSections.includes(section.id) && (
                  <Check className="h-3 w-3" />
                )}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{section.label}</p>
                <p className="text-xs text-muted-foreground">
                  {section.description}
                </p>
              </div>
            </label>
          ))}
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={pending}
        className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-2"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : saved ? (
          <Check className="h-4 w-4" />
        ) : null}
        {saved ? "Saved" : "Save Preferences"}
      </button>
    </div>
  );
}
