"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { NotificationReasonBanner } from "@/features/notifications/components/notification-reason-banner";
import type { NotificationType } from "@/features/notifications/lib/scheduler";

const TYPE_LABELS: Record<string, string> = {
  routine_reminder: "Routine Reminders",
  task_due: "Task Due Dates",
  class_start: "Class Start",
  class_end: "Class End / Attendance",
  assessment: "Assessment Reminders",
  daily_summary: "Daily Summary",
  missed_routine: "Missed Routines",
  overdue_task: "Overdue Tasks",
  review_daily: "Daily Review",
  review_weekly: "Weekly Review",
  review_monthly: "Monthly Review",
};

const TYPE_URLS: Record<string, string> = {
  routine_reminder: "/routines",
  task_due: "/tasks",
  class_start: "/courses",
  class_end: "/courses",
  assessment: "/tasks",
  daily_summary: "/today",
  missed_routine: "/routines",
  overdue_task: "/tasks",
  review_daily: "/reviews",
  review_weekly: "/reviews",
  review_monthly: "/reviews",
};

function DigestContent() {
  const searchParams = useSearchParams();
  const typesParam = searchParams.get("types") || "";
  const types = typesParam.split(",").filter(Boolean);

  if (types.length === 0) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">No notification details available.</p>
      </div>
    );
  }

  const primaryType = types[0] as NotificationType;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Notification Details</h1>
        <p className="text-sm text-muted-foreground">
          You received this grouped notification because multiple alerts fired
          within a 15-minute window.
        </p>
      </div>

      <NotificationReasonBanner type={primaryType} />

      <div className="space-y-2">
        <p className="section-label">NOTIFICATIONS IN THIS DIGEST</p>
        {types.map((type) => (
          <a
            key={type}
            href={TYPE_URLS[type] || "/today"}
            className="flex items-center justify-between p-3 rounded-md border border-input hover:bg-muted/50 transition-colors"
          >
            <div>
              <p className="text-sm font-medium">
                {TYPE_LABELS[type] || type}
              </p>
              <p className="text-xs text-muted-foreground">
                Tap to view {TYPE_LABELS[type]?.toLowerCase() || type}
              </p>
            </div>
            <span className="text-xs text-muted-foreground">→</span>
          </a>
        ))}
      </div>

      <div className="pt-4 border-t border-border">
        <a
          href="/settings"
          className="text-sm text-primary hover:underline"
        >
          Manage notification settings →
        </a>
      </div>
    </div>
  );
}

export default function DigestPage() {
  return (
    <div className="max-w-lg mx-auto p-6">
      <Suspense
        fallback={
          <div className="p-6 text-center text-muted-foreground">Loading...</div>
        }
      >
        <DigestContent />
      </Suspense>
    </div>
  );
}
