"use client";

import { useMemo, useState, useEffect } from "react";
import type { CalendarEvent } from "@/types";
import { getCalendarEventsAction } from "@/features/calendar/lib/google-actions";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const typeColors: Record<string, string> = {
  class: "bg-blue-100 text-blue-800 border-blue-200",
  assessment: "bg-amber-100 text-amber-800 border-amber-200",
  task: "bg-green-100 text-green-800 border-green-200",
  event: "bg-purple-100 text-purple-800 border-purple-200",
};

export function CalendarView() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [currentDateStr, setCurrentDateStr] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    getCalendarEventsAction(startOfMonth.toISOString(), endOfMonth.toISOString())
      .then((result) => {
        setEvents(result.events);
        setCurrentDateStr(result.currentDate);
      })
      .finally(() => setLoading(false));
  }, []);

  const currentDate = currentDateStr ? new Date(currentDateStr) : new Date();
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  const calendarDays = useMemo(() => {
    const days: (number | null)[] = [];

    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      days.push(d);
    }

    return days;
  }, [firstDay, daysInMonth]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const event of events) {
      const key = event.date.slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(event);
    }
    return map;
  }, [events]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-muted-foreground">Loading calendar...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Day headers */}
      <div className="grid grid-cols-7 gap-px">
        {DAY_NAMES.map((day) => (
          <div
            key={day}
            className="text-center text-[0.65rem] tracking-[0.15em] uppercase font-medium text-muted-foreground py-2"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
        {calendarDays.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} className="bg-background min-h-[80px] lg:min-h-[100px]" />;
          }

          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayEvents = eventsByDate[dateStr] || [];
          const isToday =
            day === currentDate.getDate() &&
            month === currentDate.getMonth() &&
            year === currentDate.getFullYear();

          return (
            <div
              key={day}
              className={`bg-background min-h-[80px] lg:min-h-[100px] p-1.5 ${
                isToday ? "bg-primary/5" : ""
              }`}
            >
              <div
                className={`text-xs font-medium mb-1 ${
                  isToday
                    ? "text-primary font-bold"
                    : "text-muted-foreground"
                }`}
              >
                {isToday ? (
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-[0.6rem]">
                    {day}
                  </span>
                ) : (
                  day
                )}
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((event) => (
                  <div
                    key={event.id}
                    className={`text-[0.6rem] leading-tight px-1 py-0.5 rounded border ${typeColors[event.type]}`}
                  >
                    {event.time && (
                      <span className="font-medium">{event.time.slice(0, 5)} </span>
                    )}
                    <span className="truncate">{event.title}</span>
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[0.6rem] text-muted-foreground text-center">
                    +{dayEvents.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
