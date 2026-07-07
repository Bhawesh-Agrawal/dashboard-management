"use client";

import { useState, useTransition } from "react";
import { saveDailySummaryPreferences } from "@/features/notifications/lib/actions";
import { Check, Loader2 } from "lucide-react";

type DailySummarySection = "classes" | "tasks" | "routines" | "deadlines" | "attendance";

const sections: { id: DailySummarySection; label: string; description: string }[] = [
  { id: "classes", label: "Today's Classes", description: "Show your schedule for today" },
  { id: "tasks", label: "Top 3 Tasks", description: "Show your starred tasks" },
  { id: "routines", label: "Routines", description: "Show today's habits" },
  { id: "deadlines", label: "Upcoming Deadlines", description: "Show deadlines in the next 7 days" },
  { id: "attendance", label: "Attendance Alerts", description: "Show courses with low attendance" },
];

export function DailySummarySettings({
  initialTime,
  initialSections,
}: {
  initialTime: string;
  initialSections: DailySummarySection[];
}) {
  const [time, setTime] = useState(initialTime);
  const [selectedSections, setSelectedSections] = useState<DailySummarySection[]>(initialSections);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleToggleSection(section: DailySummarySection) {
    setSelectedSections((prev) =>
      prev.includes(section)
        ? prev.filter((s) => s !== section)
        : [...prev, section]
    );
  }

  function handleSave() {
    startTransition(async () => {
      await saveDailySummaryPreferences(time, selectedSections);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

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
