"use client";

import { useState, useTransition } from "react";
import {
  toggleNotificationType,
  updateNotificationPriority,
  resetToDefaultPreferences,
} from "@/features/notifications/lib/actions";
import { Loader2, RotateCcw, Shield, AlertTriangle, Minus } from "lucide-react";
import { toast } from "sonner";

type NotificationType =
  | "class_start"
  | "class_end"
  | "task_due"
  | "calendar_event"
  | "morning_brief"
  | "midday_brief"
  | "evening_brief";

type Priority = "critical" | "normal" | "low";

const NOTIFICATION_TYPES: {
  type: NotificationType;
  label: string;
  description: string;
  defaultPriority: Priority;
}[] = [
  {
    type: "class_start",
    label: "Class Start",
    description: "Reminder before a scheduled class begins",
    defaultPriority: "critical",
  },
  {
    type: "class_end",
    label: "Class End / Attendance",
    description: "Prompt to mark attendance after a class ends",
    defaultPriority: "critical",
  },
  {
    type: "task_due",
    label: "Task Reminders",
    description: "Reminders for tasks with an explicit due time",
    defaultPriority: "normal",
  },
  {
    type: "calendar_event",
    label: "Calendar Events",
    description: "Reminders before scheduled events and meetings",
    defaultPriority: "normal",
  },
  {
    type: "morning_brief",
    label: "Morning Brief",
    description: "Daily morning summary of classes, tasks, DSA, and weather",
    defaultPriority: "normal",
  },
  {
    type: "midday_brief",
    label: "Midday Brief",
    description: "Optional midday update on remaining schedule and weather changes",
    defaultPriority: "normal",
  },
  {
    type: "evening_brief",
    label: "Evening Brief",
    description: "Evening preview of tomorrow's schedule and unmarked classes",
    defaultPriority: "normal",
  },
];

const PRIORITY_CONFIG: Record<Priority, { label: string; icon: typeof Shield; color: string }> = {
  critical: { label: "Critical", icon: AlertTriangle, color: "text-destructive" },
  normal: { label: "Normal", icon: Minus, color: "text-muted-foreground" },
  low: { label: "Low", icon: Shield, color: "text-primary" },
};

export function NotificationTypeToggles({
  initialPreferences,
}: {
  initialPreferences: { type: string; enabled: boolean; priority?: string | null }[];
}) {
  const [preferences, setPreferences] = useState(initialPreferences);
  const [pending, startTransition] = useTransition();
  const [resetPending, startResetTransition] = useTransition();

  function isEnabled(type: string): boolean {
    const pref = preferences.find((p) => p.type === type);
    return pref?.enabled ?? false;
  }

  function getPriority(type: string): Priority {
    const pref = preferences.find((p) => p.type === type);
    return (pref?.priority as Priority) || "normal";
  }

  function handleToggle(type: string) {
    const currentEnabled = isEnabled(type);
    const newEnabled = !currentEnabled;

    // Optimistic update
    setPreferences((prev) => {
      const existing = prev.find((p) => p.type === type);
      if (existing) {
        return prev.map((p) => (p.type === type ? { ...p, enabled: newEnabled } : p));
      }
      return [...prev, { type, enabled: newEnabled }];
    });

    startTransition(async () => {
      await toggleNotificationType(type, newEnabled);
    });
  }

  function handlePriorityCycle(type: string) {
    const current = getPriority(type);
    const cycle: Priority[] = ["critical", "normal", "low"];
    const next = cycle[(cycle.indexOf(current) + 1) % cycle.length];

    setPreferences((prev) =>
      prev.map((p) => (p.type === type ? { ...p, priority: next } : p))
    );

    startTransition(async () => {
      await updateNotificationPriority(type, next);
    });
  }

  function handleReset() {
    startResetTransition(async () => {
      const result = await resetToDefaultPreferences();
      if (result.success) {
        // Refresh preferences
        const prefs = await import("@/features/notifications/lib/actions").then((m) =>
          m.getNotificationPreferences()
        );
        setPreferences(prefs);
        toast.success("Reset to recommended defaults");
      } else {
        toast.error("Failed to reset preferences");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {NOTIFICATION_TYPES.map((nt) => {
          const priority = getPriority(nt.type);
          const PConfig = PRIORITY_CONFIG[priority];
          const PIcon = PConfig.icon;

          return (
            <div
              key={nt.type}
              className="flex items-center gap-2 p-3 rounded-md border border-input hover:bg-muted/50 transition-colors"
            >
              <button
                onClick={() => handleToggle(nt.type)}
                disabled={pending}
                className="flex-1 flex items-center justify-between text-left disabled:opacity-50"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{nt.label}</p>
                  <p className="text-xs text-muted-foreground">{nt.description}</p>
                </div>
                <div className="ml-4 shrink-0">
                  {pending ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <div
                      className={`w-10 h-6 rounded-full transition-colors relative ${
                        isEnabled(nt.type) ? "bg-primary" : "bg-muted"
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 w-5 h-5 rounded-full bg-background shadow transition-transform ${
                          isEnabled(nt.type) ? "translate-x-4" : "translate-x-0.5"
                        }`}
                      />
                    </div>
                  )}
                </div>
              </button>

              <button
                onClick={() => handlePriorityCycle(nt.type)}
                disabled={pending}
                className={`shrink-0 p-1 rounded hover:bg-muted transition-colors ${PConfig.color}`}
                title={`Priority: ${PConfig.label}`}
              >
                <PIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 pt-2">
        <button
          onClick={handleReset}
          disabled={resetPending}
          className="h-9 px-4 rounded-md border border-input text-sm hover:bg-muted transition-colors disabled:opacity-50 inline-flex items-center gap-2"
        >
          {resetPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RotateCcw className="h-4 w-4" />
          )}
          Reset to recommended
        </button>
        <p className="text-xs text-muted-foreground">
          Enables the 6 core notification types (class, attendance, task, event, briefs)
        </p>
      </div>
    </div>
  );
}
