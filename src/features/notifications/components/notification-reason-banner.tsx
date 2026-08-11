"use client";

import { useState, useTransition } from "react";
import { toggleNotificationType } from "@/features/notifications/lib/actions";
import { Info, X } from "lucide-react";
import type { NotificationType } from "@/features/notifications/lib/scheduler";

const TYPE_LABELS: Record<NotificationType, string> = {
  routine_reminder: "Routine Reminders",
  task_due: "Task Due Dates",
  class_start: "Class Start",
  class_end: "Class End / Attendance",
  class_cancelled: "Class Cancelled",
  class_rescheduled: "Class Rescheduled",
  assessment: "Assessment Reminders",
  daily_summary: "Daily Summary",
  missed_routine: "Missed Routines",
  overdue_task: "Overdue Tasks",
  review_daily: "Daily Review",
  review_weekly: "Weekly Review",
  review_monthly: "Monthly Review",
};

/**
 * "Why am I seeing this?" banner shown after clicking a notification.
 * Explains why the notification was sent and offers a one-tap mute.
 */
export function NotificationReasonBanner({
  type,
  onMuted,
}: {
  type: NotificationType;
  onMuted?: () => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [muted, setMuted] = useState(false);
  const [pending, startTransition] = useTransition();

  if (dismissed || muted) return null;

  function handleMute() {
    startTransition(async () => {
      await toggleNotificationType(type, false);
      setMuted(true);
      onMuted?.();
    });
  }

  return (
    <div className="flex items-start gap-3 p-3 rounded-md border border-primary/20 bg-primary/5">
      <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm">
          You&apos;re seeing this because{" "}
          <span className="font-medium">{TYPE_LABELS[type]}</span> notifications
          are enabled.
        </p>
        <button
          onClick={handleMute}
          disabled={pending}
          className="mt-1 text-sm font-medium text-primary hover:underline disabled:opacity-50"
        >
          {pending ? "Muting..." : "Mute this type"}
        </button>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
