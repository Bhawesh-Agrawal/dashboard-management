"use client";

import { CheckCircle2, XCircle, Clock } from "lucide-react";
import type { DashboardData } from "@/types";
import { cn } from "@/lib/utils";

type TimelineItem = {
  id: string;
  title: string;
  subtitle?: string;
  timeLabel: string;
  sortTime: number; // minutes from midnight
  type: "class" | "deadline" | "routine";
  status?: "done" | "pending";
  exception?: "cancelled" | "rescheduled";
  originalTime?: string;
};

export function DailyTimeline({
  classes,
  deadlines,
  routines,
}: {
  classes: DashboardData["todayClasses"];
  deadlines: DashboardData["upcomingDeadlines"];
  routines: DashboardData["routines"];
}) {
  const items: TimelineItem[] = [];

  // Parse classes
  const now = new Date();
  const currentTotal = now.getHours() * 60 + now.getMinutes();

  classes.forEach((c) => {
    const exception = (c as any).exceptions?.[0];

    // Skip cancelled classes entirely from timeline
    if (exception?.type === "cancelled") {
      items.push({
        id: `class-${c.id}`,
        title: c.course.name,
        subtitle: "Cancelled",
        timeLabel: c.startTime,
        sortTime: (() => {
          const [h, m] = c.startTime.split(":").map(Number);
          return h * 60 + m;
        })(),
        type: "class",
        exception: "cancelled",
      });
      return;
    }

    // Use rescheduled times if available
    const startTimeStr = exception?.type === "rescheduled" && exception.newStartTime
      ? exception.newStartTime
      : c.startTime;
    const endTimeStr = exception?.type === "rescheduled" && exception.newEndTime
      ? exception.newEndTime
      : c.endTime;
    const location = exception?.type === "rescheduled" && exception.newLocation
      ? exception.newLocation
      : c.location;

    const [startHours, startMinutes] = startTimeStr.split(":").map(Number);
    const [endHours, endMinutes] = endTimeStr.split(":").map(Number);
    
    // Check if class has ended
    const classEndTime = endHours * 60 + endMinutes;
    if (currentTotal >= classEndTime) {
       // Skip adding to timeline as it's already over
       return;
    }

    items.push({
      id: `class-${c.id}`,
      title: c.course.name,
      subtitle: location || undefined,
      timeLabel: startTimeStr,
      sortTime: startHours * 60 + startMinutes,
      type: "class",
      exception: exception?.type === "rescheduled" ? "rescheduled" : undefined,
      originalTime: exception?.type === "rescheduled" ? c.startTime : undefined,
    });
  });

  // Parse routines
  routines.forEach((r) => {
    let sortTime = 23 * 60 + 59; // Default to end of day if no specific time
    if (r.specificTime) {
      const [hours, minutes] = r.specificTime.split(":").map(Number);
      sortTime = hours * 60 + minutes;
    }
    items.push({
      id: `routine-${r.id}`,
      title: r.name,
      timeLabel: r.specificTime || r.timeOfDay,
      sortTime,
      type: "routine",
      status: r.completedToday ? "done" : "pending",
    });
  });

  // Parse deadlines (only today's deadlines)
  const today = new Date().toDateString();
  deadlines.forEach((d) => {
    if (d.date && new Date(d.date).toDateString() === today) {
      // Deadlines usually don't have a specific time in this model
      // Let's put them at 23:59 (end of day)
      items.push({
        id: `deadline-${d.id}`,
        title: d.title,
        subtitle: d.courseName || d.projectName || d.personName,
        timeLabel: "Due Today",
        sortTime: 23 * 60 + 58,
        type: "deadline",
      });
    }
  });

  // Sort by time
  items.sort((a, b) => a.sortTime - b.sortTime);

  if (items.length === 0) {
    return (
      <div>
        <p className="section-label mb-3">DAILY TIMELINE</p>
        <p className="text-sm text-muted-foreground">Nothing scheduled for today.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="section-label mb-3">DAILY TIMELINE</p>
      <div className="relative pl-4 space-y-6 before:absolute before:inset-y-0 before:left-[7px] before:w-[2px] before:bg-border">
        {items.map((item) => (
          <div key={item.id} className="relative">
            {/* Timeline dot */}
            <div
              className={cn(
                "absolute -left-4 w-4 h-4 rounded-full border-2 border-background flex items-center justify-center top-1",
                item.type === "class" && !item.exception && "bg-blue-500",
                item.type === "class" && item.exception === "cancelled" && "bg-muted",
                item.type === "class" && item.exception === "rescheduled" && "bg-amber-500",
                item.type === "deadline" && "bg-red-500",
                item.type === "routine" && (item.status === "done" ? "bg-emerald-500" : "bg-amber-500")
              )}
            />
            
            <div className="pl-4">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={cn(
                  "text-xs font-medium uppercase tracking-wider",
                  item.type === "class" && !item.exception && "text-blue-500",
                  item.type === "class" && item.exception === "cancelled" && "text-muted-foreground line-through",
                  item.type === "class" && item.exception === "rescheduled" && "text-amber-500",
                  item.type === "deadline" && "text-red-500",
                  item.type === "routine" && "text-amber-500"
                )}>
                  {item.timeLabel}
                </span>
                {item.status === "done" && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                )}
                {item.exception === "cancelled" && (
                  <XCircle className="w-3.5 h-3.5 text-muted-foreground" />
                )}
                {item.exception === "rescheduled" && (
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                )}
              </div>
              <p className={cn(
                "text-sm font-medium",
                item.status === "done" && "line-through text-muted-foreground",
                item.exception === "cancelled" && "line-through text-muted-foreground"
              )}>
                {item.title}
                {item.exception === "rescheduled" && item.originalTime && (
                  <span className="text-xs text-muted-foreground ml-2">
                    (was {item.originalTime})
                  </span>
                )}
              </p>
              {item.subtitle && (
                <p className={cn(
                  "text-xs mt-0.5",
                  item.exception === "cancelled" ? "text-muted-foreground" : "text-muted-foreground"
                )}>
                  {item.exception === "cancelled" ? "Class cancelled" : item.subtitle}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
