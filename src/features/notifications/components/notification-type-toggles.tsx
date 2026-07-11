"use client";

import { useState, useTransition } from "react";
import { toggleNotificationType } from "@/features/notifications/lib/actions";
import { Loader2 } from "lucide-react";

type NotificationType =
  | "routine_reminder"
  | "task_due"
  | "class_start"
  | "assessment"
  | "daily_summary"
  | "missed_routine"
  | "overdue_task"
  | "review_daily"
  | "review_weekly"
  | "review_monthly";

const NOTIFICATION_TYPES: {
  type: NotificationType;
  label: string;
  description: string;
}[] = [
  {
    type: "routine_reminder",
    label: "Routine Reminders",
    description: "Get reminded when a routine is scheduled",
  },
  {
    type: "task_due",
    label: "Task Due Dates",
    description: "Alerts for tasks due today or tomorrow",
  },
  {
    type: "class_start",
    label: "Class Start",
    description: "Notification when a class is about to begin",
  },
  {
    type: "assessment",
    label: "Assessment Reminders",
    description: "Alerts for assessments due today or tomorrow",
  },
  {
    type: "daily_summary",
    label: "Daily Summary",
    description: "Detailed digest with schedule, tasks, routines, and attendance",
  },
  {
    type: "missed_routine",
    label: "Missed Routines",
    description: "Evening alert for routines you haven't completed today",
  },
  {
    type: "overdue_task",
    label: "Overdue Tasks",
    description: "Morning alert for tasks past their due date",
  },
  {
    type: "review_daily",
    label: "Daily Review",
    description: "Morning alert when your daily brief is ready",
  },
  {
    type: "review_weekly",
    label: "Weekly Review",
    description: "Sunday evening alert for your weekly review",
  },
  {
    type: "review_monthly",
    label: "Monthly Review",
    description: "End-of-month alert for your strategic review",
  },
];

export function NotificationTypeToggles({
  initialPreferences,
}: {
  initialPreferences: { type: string; enabled: boolean }[];
}) {
  const [preferences, setPreferences] = useState(initialPreferences);
  const [pending, startTransition] = useTransition();

  function isEnabled(type: string): boolean {
    const pref = preferences.find((p) => p.type === type);
    return pref?.enabled ?? true;
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

  return (
    <div className="space-y-2">
      {NOTIFICATION_TYPES.map((nt) => (
        <button
          key={nt.type}
          onClick={() => handleToggle(nt.type)}
          disabled={pending}
          className="flex items-center justify-between w-full p-3 rounded-md border border-input hover:bg-muted/50 transition-colors text-left disabled:opacity-50"
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
      ))}
    </div>
  );
}
