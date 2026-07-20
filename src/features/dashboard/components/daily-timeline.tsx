"use client";

import { CheckCircle2 } from "lucide-react";
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
    const [startHours, startMinutes] = c.startTime.split(":").map(Number);
    const [endHours, endMinutes] = c.endTime.split(":").map(Number);
    
    // Check if class has ended
    const classEndTime = endHours * 60 + endMinutes;
    if (currentTotal >= classEndTime) {
       // Skip adding to timeline as it's already over
       return;
    }

    items.push({
      id: `class-${c.id}`,
      title: c.course.name,
      subtitle: c.location || undefined,
      timeLabel: c.startTime,
      sortTime: startHours * 60 + startMinutes,
      type: "class",
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
                item.type === "class" && "bg-blue-500",
                item.type === "deadline" && "bg-red-500",
                item.type === "routine" && (item.status === "done" ? "bg-emerald-500" : "bg-amber-500")
              )}
            />
            
            <div className="pl-4">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={cn(
                  "text-xs font-medium uppercase tracking-wider",
                  item.type === "class" && "text-blue-500",
                  item.type === "deadline" && "text-red-500",
                  item.type === "routine" && "text-amber-500"
                )}>
                  {item.timeLabel}
                </span>
                {item.status === "done" && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                )}
              </div>
              <p className={cn("text-sm font-medium", item.status === "done" && "line-through text-muted-foreground")}>
                {item.title}
              </p>
              {item.subtitle && (
                <p className="text-xs text-muted-foreground mt-0.5">{item.subtitle}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
