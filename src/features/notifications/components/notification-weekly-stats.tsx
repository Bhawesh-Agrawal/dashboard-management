"use client";

import { useState, useEffect } from "react";
import {
  getNotificationWeeklyStats,
  type NotificationTypeStats,
} from "@/features/notifications/lib/actions";
import { BarChart3, Loader2 } from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  class_start: "Class Start",
  class_end: "Class End / Attendance",
  task_due: "Task Reminders",
  calendar_event: "Calendar Events",
  morning_brief: "Morning Brief",
  evening_brief: "Evening Brief",
};

export function NotificationWeeklyStats() {
  const [stats, setStats] = useState<NotificationTypeStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getNotificationWeeklyStats().then((s) => {
      setStats(s);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground p-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading weekly stats...</span>
      </div>
    );
  }

  if (stats.length === 0) {
    return (
      <div className="p-4 rounded-md border border-input">
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-medium">Weekly Notification Stats</p>
        </div>
        <p className="text-xs text-muted-foreground">
          No notifications sent this week. Stats will appear once you start receiving notifications.
        </p>
      </div>
    );
  }

  const totalSent = stats.reduce((acc, s) => acc + s.sent, 0);
  const totalOpened = stats.reduce((acc, s) => acc + s.opened, 0);
  const overallRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-medium">Weekly Notification Stats</p>
      </div>

      <div className="p-3 rounded-md bg-muted/50">
        <p className="text-xs text-muted-foreground">
          You received <span className="font-medium text-foreground">{totalSent}</span> notifications
          this week, <span className="font-medium text-foreground">{overallRate}%</span> opened.
        </p>
      </div>

      <div className="space-y-2">
        {stats
          .sort((a, b) => b.sent - a.sent)
          .map((stat) => (
            <div
              key={stat.type}
              className="flex items-center justify-between p-3 rounded-md border border-input"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  {TYPE_LABELS[stat.type] || stat.type}
                </p>
                <p className="text-xs text-muted-foreground">
                  {stat.sent} sent · {stat.opened} opened
                </p>
              </div>
              <div className="ml-4 shrink-0 flex items-center gap-2">
                <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${stat.openRate}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground w-8 text-right">
                  {stat.openRate}%
                </span>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
