"use client";

import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import type { CalendarEvent } from "@/types";
import { getCalendarEventsAction } from "@/features/calendar/lib/google-actions";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  LayoutGrid,
  Clock,
  MapPin,
  BookOpen,
  CheckSquare,
  Sparkles,
  Cake,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

type CalendarView = "week" | "month" | "day";

const SHORT_DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FULL_DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);

// ─── Event color system (matches warm editorial palette) ─────────────────────

const EVENT_STYLES: Record<string, { bg: string; text: string; dot: string; border: string }> = {
  class:      { bg: "bg-blue-50 dark:bg-blue-950/40",   text: "text-blue-700 dark:text-blue-300",   dot: "bg-blue-500",   border: "border-blue-200 dark:border-blue-800" },
  assessment: { bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-300", dot: "bg-amber-500", border: "border-amber-200 dark:border-amber-800" },
  task:       { bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500", border: "border-emerald-200 dark:border-emerald-800" },
  event:      { bg: "bg-violet-50 dark:bg-violet-950/40", text: "text-violet-700 dark:text-violet-300", dot: "bg-violet-500", border: "border-violet-200 dark:border-violet-800" },
  birthday:   { bg: "bg-pink-50 dark:bg-pink-950/40",   text: "text-pink-700 dark:text-pink-300",   dot: "bg-pink-500",   border: "border-pink-200 dark:border-pink-800" },
};

function getEventStyle(event: CalendarEvent) {
  if (event.isBirthday) return EVENT_STYLES.birthday;
  return EVENT_STYLES[event.type] ?? EVENT_STYLES.event;
}

function getEventIcon(event: CalendarEvent) {
  if (event.isBirthday) return <Cake className="h-3 w-3 shrink-0" />;
  if (event.type === "class") return <BookOpen className="h-3 w-3 shrink-0" />;
  if (event.type === "assessment") return <Sparkles className="h-3 w-3 shrink-0" />;
  if (event.type === "task") return <CheckSquare className="h-3 w-3 shrink-0" />;
  return <CalendarDays className="h-3 w-3 shrink-0" />;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function toDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseTime(t?: string): number {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function formatHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

function formatTime(t?: string): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h < 12 ? "AM" : "PM";
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayH}:${String(m).padStart(2, "0")} ${ampm}`;
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function CalendarSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="flex items-center justify-between">
        <div className="h-8 w-48 bg-muted rounded-lg" />
        <div className="flex gap-2">
          <div className="h-8 w-24 bg-muted rounded-lg" />
          <div className="h-8 w-8 bg-muted rounded-lg" />
          <div className="h-8 w-8 bg-muted rounded-lg" />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px bg-border rounded-xl overflow-hidden">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="bg-background p-2">
            <div className="h-4 w-full bg-muted rounded mb-2" />
            <div className="space-y-1">
              <div className="h-6 bg-muted rounded" />
              <div className="h-6 bg-muted rounded opacity-60" />
            </div>
          </div>
        ))}
      </div>
      <div className="h-64 bg-muted/30 rounded-xl border border-border" />
    </div>
  );
}

// ─── Event chip (used in month view and day panel) ────────────────────────────

function EventChip({
  event,
  onClick,
  compact = false,
}: {
  event: CalendarEvent;
  onClick?: () => void;
  compact?: boolean;
}) {
  const style = getEventStyle(event);
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left flex items-center gap-1.5 rounded-md border px-1.5 py-1 transition-all",
        "hover:scale-[1.02] hover:shadow-sm active:scale-[0.98]",
        style.bg, style.text, style.border,
        compact ? "text-[0.55rem] py-0.5 gap-1" : "text-xs"
      )}
    >
      <span className={cn("shrink-0 rounded-full", style.dot, compact ? "w-1.5 h-1.5" : "w-2 h-2")} />
      <span className="truncate font-medium leading-tight">
        {event.time && !compact && (
          <span className="opacity-70 font-normal mr-1">{formatTime(event.time)}</span>
        )}
        {event.title}
      </span>
    </button>
  );
}

// ─── Week/Day event block (positioned in time grid) ───────────────────────────

function TimeEventBlock({
  event,
  slotHeight,
  onClick,
}: {
  event: CalendarEvent;
  slotHeight: number;
  onClick: () => void;
}) {
  const style = getEventStyle(event);
  const startMin = parseTime(event.time);
  const endMin = event.endTime ? parseTime(event.endTime) : startMin + 60;
  const durationMin = Math.max(endMin - startMin, 30);

  const topPx = (startMin / 60) * slotHeight;
  const heightPx = Math.max((durationMin / 60) * slotHeight - 2, 22);
  const isShort = heightPx < 38;

  return (
    <button
      onClick={onClick}
      style={{ top: topPx, height: heightPx }}
      className={cn(
        "absolute left-0.5 right-0.5 rounded-md border px-1.5 py-1 text-left",
        "overflow-hidden transition-all hover:scale-[1.02] hover:shadow-md hover:z-10",
        "active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-ring",
        style.bg, style.border, style.text
      )}
    >
      {isShort ? (
        <p className="text-[0.6rem] font-medium leading-tight truncate">{event.title}</p>
      ) : (
        <>
          <div className="flex items-center gap-1 mb-0.5">
            {getEventIcon(event)}
            <p className="text-[0.65rem] font-semibold leading-tight truncate">{event.title}</p>
          </div>
          {event.time && (
            <p className="text-[0.6rem] opacity-70 leading-tight">
              {formatTime(event.time)}{event.endTime ? ` – ${formatTime(event.endTime)}` : ""}
            </p>
          )}
          {event.location && !isShort && (
            <p className="text-[0.6rem] opacity-60 truncate mt-0.5">{event.location}</p>
          )}
        </>
      )}
    </button>
  );
}

// ─── Week View ────────────────────────────────────────────────────────────────

const SLOT_HEIGHT = 60; // px per hour
const TIME_COL_WIDTH = 48; // px

function WeekView({
  weekStart,
  eventsByDate,
  today,
  selectedDate,
  onSelectDate,
  onSelectEvent,
}: {
  weekStart: Date;
  eventsByDate: Record<string, CalendarEvent[]>;
  today: Date;
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  onSelectEvent: (e: CalendarEvent) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Scroll to 7 AM on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 7 * SLOT_HEIGHT;
    }
  }, [weekStart]);

  // Find earliest event for initial scroll hint
  const nowMin = today.getHours() * 60 + today.getMinutes();

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* Day headers */}
      <div
        className="grid border-b border-border bg-background"
        style={{ gridTemplateColumns: `${TIME_COL_WIDTH}px repeat(7, 1fr)` }}
      >
        <div className="py-2" /> {/* time gutter */}
        {days.map((day) => {
          const isToday = isSameDay(day, today);
          const isSelected = isSameDay(day, selectedDate);
          return (
            <button
              key={day.toISOString()}
              onClick={() => onSelectDate(day)}
              className={cn(
                "flex flex-col items-center py-2 gap-0.5 border-l border-border",
                "hover:bg-accent/50 transition-colors"
              )}
            >
              <span className={cn(
                "text-[0.6rem] tracking-widest uppercase font-medium",
                isToday ? "text-primary" : "text-muted-foreground"
              )}>
                {SHORT_DAY_NAMES[day.getDay()]}
              </span>
              <span className={cn(
                "text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full transition-colors",
                isToday && "bg-primary text-primary-foreground",
                isSelected && !isToday && "bg-muted text-foreground ring-2 ring-primary/40",
                !isToday && !isSelected && "text-foreground hover:bg-accent"
              )}>
                {day.getDate()}
              </span>
            </button>
          );
        })}
      </div>

      {/* Scrollable time grid */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-none relative"
        style={{ minHeight: 0 }}
      >
        <div
          className="relative grid"
          style={{
            gridTemplateColumns: `${TIME_COL_WIDTH}px repeat(7, 1fr)`,
            height: 24 * SLOT_HEIGHT,
          }}
        >
          {/* Hour labels */}
          <div className="relative">
            {HOURS.map((h) => (
              <div
                key={h}
                className="absolute flex items-start justify-end pr-2"
                style={{ top: h * SLOT_HEIGHT - 8, height: SLOT_HEIGHT, width: TIME_COL_WIDTH }}
              >
                {h > 0 && (
                  <span className="text-[0.6rem] text-muted-foreground select-none">
                    {formatHour(h)}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day, colIdx) => {
            const dateStr = toDateStr(day);
            const dayEvents = eventsByDate[dateStr] || [];
            const isToday = isSameDay(day, today);

            return (
              <div
                key={dateStr}
                className={cn(
                  "relative border-l border-border",
                  isToday && "bg-primary/[0.02]"
                )}
              >
                {/* Hour grid lines */}
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="absolute w-full border-t border-border/50"
                    style={{ top: h * SLOT_HEIGHT }}
                  />
                ))}
                {/* Half-hour lines */}
                {HOURS.map((h) => (
                  <div
                    key={`h-${h}`}
                    className="absolute w-full border-t border-border/20"
                    style={{ top: h * SLOT_HEIGHT + SLOT_HEIGHT / 2 }}
                  />
                ))}

                {/* Now line */}
                {isToday && (
                  <div
                    className="absolute left-0 right-0 z-20 pointer-events-none"
                    style={{ top: (nowMin / 60) * SLOT_HEIGHT }}
                  >
                    <div className="relative flex items-center">
                      <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 shrink-0" />
                      <div className="flex-1 h-px bg-red-500" />
                    </div>
                  </div>
                )}

                {/* Events */}
                {dayEvents
                  .filter((e) => e.time)
                  .map((event) => (
                    <TimeEventBlock
                      key={event.id}
                      event={event}
                      slotHeight={SLOT_HEIGHT}
                      onClick={() => onSelectEvent(event)}
                    />
                  ))}

                {/* All-day / no-time events */}
                {dayEvents.filter((e) => !e.time).length > 0 && (
                  <div
                    className="absolute top-1 left-0.5 right-0.5 space-y-0.5"
                    style={{ zIndex: 5 }}
                  >
                    {dayEvents
                      .filter((e) => !e.time)
                      .slice(0, 2)
                      .map((event) => {
                        const s = getEventStyle(event);
                        return (
                          <button
                            key={event.id}
                            onClick={() => onSelectEvent(event)}
                            className={cn(
                              "w-full text-left px-1 py-0.5 rounded text-[0.55rem] font-medium truncate border",
                              s.bg, s.text, s.border
                            )}
                          >
                            {event.title}
                          </button>
                        );
                      })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Day View ─────────────────────────────────────────────────────────────────

function DayView({
  date,
  eventsByDate,
  today,
  onSelectEvent,
}: {
  date: Date;
  eventsByDate: Record<string, CalendarEvent[]>;
  today: Date;
  onSelectEvent: (e: CalendarEvent) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dateStr = toDateStr(date);
  const dayEvents = eventsByDate[dateStr] || [];
  const isToday = isSameDay(date, today);
  const nowMin = today.getHours() * 60 + today.getMinutes();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 7 * SLOT_HEIGHT;
    }
  }, [date]);

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* Day header */}
      <div className="border-b border-border px-4 py-3 bg-background flex items-center gap-3">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest font-medium">
            {FULL_DAY_NAMES[date.getDay()]}
          </p>
          <p className={cn("text-2xl font-bold", isToday && "text-primary")}>
            {date.getDate()} {MONTH_NAMES[date.getMonth()]}
          </p>
        </div>
        <div className="ml-auto text-xs text-muted-foreground">
          {dayEvents.length} event{dayEvents.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* All-day events */}
      {dayEvents.filter((e) => !e.time).length > 0 && (
        <div className="border-b border-border px-4 py-2 space-y-1 bg-muted/20">
          <p className="text-[0.6rem] text-muted-foreground uppercase tracking-widest font-medium mb-1">All Day</p>
          {dayEvents.filter((e) => !e.time).map((event) => (
            <EventChip key={event.id} event={event} onClick={() => onSelectEvent(event)} />
          ))}
        </div>
      )}

      {/* Time grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-none">
        <div
          className="relative"
          style={{
            height: 24 * SLOT_HEIGHT,
            display: "grid",
            gridTemplateColumns: `${TIME_COL_WIDTH}px 1fr`,
          }}
        >
          {/* Hour labels */}
          <div className="relative">
            {HOURS.map((h) => (
              <div
                key={h}
                className="absolute flex items-start justify-end pr-2"
                style={{ top: h * SLOT_HEIGHT - 8, height: SLOT_HEIGHT, width: TIME_COL_WIDTH }}
              >
                {h > 0 && (
                  <span className="text-[0.6rem] text-muted-foreground">{formatHour(h)}</span>
                )}
              </div>
            ))}
          </div>

          {/* Events column */}
          <div className="relative border-l border-border">
            {HOURS.map((h) => (
              <div key={h} className="absolute w-full border-t border-border/50" style={{ top: h * SLOT_HEIGHT }} />
            ))}
            {HOURS.map((h) => (
              <div key={`h-${h}`} className="absolute w-full border-t border-border/20" style={{ top: h * SLOT_HEIGHT + SLOT_HEIGHT / 2 }} />
            ))}

            {isToday && (
              <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: (nowMin / 60) * SLOT_HEIGHT }}>
                <div className="relative flex items-center">
                  <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 shrink-0" />
                  <div className="flex-1 h-px bg-red-500" />
                </div>
              </div>
            )}

            {dayEvents
              .filter((e) => e.time)
              .map((event) => (
                <TimeEventBlock key={event.id} event={event} slotHeight={SLOT_HEIGHT} onClick={() => onSelectEvent(event)} />
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Month View ───────────────────────────────────────────────────────────────

function MonthView({
  year,
  month,
  eventsByDate,
  today,
  selectedDate,
  onSelectDate,
  onSelectEvent,
}: {
  year: number;
  month: number;
  eventsByDate: Record<string, CalendarEvent[]>;
  today: Date;
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  onSelectEvent: (e: CalendarEvent) => void;
}) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const cells: { date: Date; isCurrentMonth: boolean }[] = [];

  // Previous month fill
  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month - 1, prevMonthDays - i), isCurrentMonth: false });
  }
  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), isCurrentMonth: true });
  }
  // Next month fill
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    cells.push({ date: new Date(year, month + 1, d), isCurrentMonth: false });
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Day name headers */}
      <div className="grid grid-cols-7 border-b border-border">
        {SHORT_DAY_NAMES.map((day) => (
          <div key={day} className="py-2 text-center text-[0.6rem] uppercase tracking-widest font-medium text-muted-foreground">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 flex-1 auto-rows-fr">
        {cells.map(({ date, isCurrentMonth }, idx) => {
          const dateStr = toDateStr(date);
          const dayEvents = eventsByDate[dateStr] || [];
          const isToday = isSameDay(date, today);
          const isSelected = isSameDay(date, selectedDate);
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;

          return (
            <div
              key={idx}
              onClick={() => onSelectDate(date)}
              className={cn(
                "border-b border-r border-border p-1.5 cursor-pointer min-h-[80px] sm:min-h-[100px]",
                "hover:bg-accent/30 transition-colors group",
                isToday && "bg-primary/[0.03]",
                isSelected && !isToday && "bg-accent/50",
                !isCurrentMonth && "opacity-40"
              )}
            >
              {/* Date number */}
              <div className="flex justify-end mb-1">
                <span className={cn(
                  "text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full transition-colors",
                  isToday && "bg-primary text-primary-foreground font-bold",
                  isSelected && !isToday && "ring-2 ring-primary/50",
                  !isToday && isWeekend && "text-muted-foreground",
                  !isToday && !isWeekend && "text-foreground"
                )}>
                  {date.getDate()}
                </span>
              </div>

              {/* Events */}
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((event) => (
                  <div key={event.id} onClick={(e) => e.stopPropagation()}>
                    <EventChip
                      event={event}
                      compact
                      onClick={() => onSelectEvent(event)}
                    />
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onSelectDate(date); }}
                    className="text-[0.55rem] text-muted-foreground hover:text-foreground transition-colors w-full text-left pl-1"
                  >
                    +{dayEvents.length - 3} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Mini Calendar (sidebar) ──────────────────────────────────────────────────

function MiniCalendar({
  year,
  month,
  selectedDate,
  today,
  eventsByDate,
  onSelectDate,
  onChangeMonth,
}: {
  year: number;
  month: number;
  selectedDate: Date;
  today: Date;
  eventsByDate: Record<string, CalendarEvent[]>;
  onSelectDate: (d: Date) => void;
  onChangeMonth: (delta: number) => void;
}) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const cells: { date: Date; isCurrentMonth: boolean }[] = [];
  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month - 1, prevMonthDays - i), isCurrentMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), isCurrentMonth: true });
  }
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    cells.push({ date: new Date(year, month + 1, d), isCurrentMonth: false });
  }

  return (
    <div className="p-3">
      {/* Month header */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => onChangeMonth(-1)}
          className="p-1 rounded-md hover:bg-accent transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <span className="text-xs font-semibold text-foreground">
          {MONTH_NAMES[month]} {year}
        </span>
        <button
          onClick={() => onChangeMonth(1)}
          className="p-1 rounded-md hover:bg-accent transition-colors"
        >
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {SHORT_DAY_NAMES.map((d) => (
          <div key={d} className="text-center text-[0.55rem] uppercase tracking-wider text-muted-foreground py-0.5">
            {d[0]}
          </div>
        ))}
      </div>

      {/* Cells */}
      <div className="grid grid-cols-7 gap-px">
        {cells.map(({ date, isCurrentMonth }, idx) => {
          const dateStr = toDateStr(date);
          const hasEvents = (eventsByDate[dateStr] || []).length > 0;
          const isToday = isSameDay(date, today);
          const isSelected = isSameDay(date, selectedDate);

          return (
            <button
              key={idx}
              onClick={() => onSelectDate(date)}
              className={cn(
                "relative flex flex-col items-center justify-center aspect-square rounded-md",
                "text-[0.65rem] font-medium transition-all hover:bg-accent",
                isToday && "bg-primary text-primary-foreground hover:bg-primary/90",
                isSelected && !isToday && "bg-muted ring-1 ring-primary/40",
                !isCurrentMonth && "opacity-30",
                !isToday && !isSelected && "text-foreground"
              )}
            >
              {date.getDate()}
              {hasEvents && !isToday && (
                <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-primary/60" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Day Detail Panel (sidebar) ───────────────────────────────────────────────

function DayDetailPanel({
  date,
  events,
  onSelectEvent,
  onClose,
}: {
  date: Date;
  events: CalendarEvent[];
  onSelectEvent: (e: CalendarEvent) => void;
  onClose?: () => void;
}) {
  const timedEvents = events.filter((e) => e.time).sort((a, b) =>
    (a.time || "").localeCompare(b.time || "")
  );
  const allDayEvents = events.filter((e) => !e.time);

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div>
          <p className="section-label">{FULL_DAY_NAMES[date.getDay()]}</p>
          <p className="text-lg font-semibold text-foreground">
            {date.getDate()} {MONTH_NAMES[date.getMonth()]}
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-accent transition-colors lg:hidden"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-none p-3 space-y-4">
        {events.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <CalendarDays className="h-8 w-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No events</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Enjoy your free time!</p>
          </div>
        )}

        {allDayEvents.length > 0 && (
          <div>
            <p className="text-[0.6rem] uppercase tracking-widest font-medium text-muted-foreground mb-2">All Day</p>
            <div className="space-y-1.5">
              {allDayEvents.map((event) => (
                <DetailEventCard key={event.id} event={event} onClick={() => onSelectEvent(event)} />
              ))}
            </div>
          </div>
        )}

        {timedEvents.length > 0 && (
          <div>
            <p className="text-[0.6rem] uppercase tracking-widest font-medium text-muted-foreground mb-2">Schedule</p>
            <div className="space-y-1.5">
              {timedEvents.map((event) => (
                <DetailEventCard key={event.id} event={event} onClick={() => onSelectEvent(event)} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailEventCard({ event, onClick }: { event: CalendarEvent; onClick: () => void }) {
  const style = getEventStyle(event);
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-lg border p-3 transition-all",
        "hover:shadow-sm hover:scale-[1.01] active:scale-[0.99]",
        style.bg, style.border
      )}
    >
      <div className="flex items-start gap-2">
        <div className={cn("mt-0.5 p-1 rounded-md", style.bg, style.text)}>
          {getEventIcon(event)}
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn("text-xs font-semibold leading-tight truncate", style.text)}>{event.title}</p>
          {event.courseName && (
            <p className="text-[0.65rem] text-muted-foreground mt-0.5 truncate">{event.courseName}</p>
          )}
          <div className="flex flex-wrap gap-x-2 mt-1">
            {event.time && (
              <span className="flex items-center gap-0.5 text-[0.6rem] text-muted-foreground">
                <Clock className="h-2.5 w-2.5" />
                {formatTime(event.time)}{event.endTime ? ` – ${formatTime(event.endTime)}` : ""}
              </span>
            )}
            {event.location && (
              <span className="flex items-center gap-0.5 text-[0.6rem] text-muted-foreground">
                <MapPin className="h-2.5 w-2.5" />
                {event.location}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Event Detail Modal ───────────────────────────────────────────────────────

function EventDetailModal({
  event,
  onClose,
}: {
  event: CalendarEvent;
  onClose: () => void;
}) {
  const style = getEventStyle(event);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={cn(
          "w-full max-w-sm rounded-2xl border bg-card shadow-2xl p-5",
          "animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Type badge */}
        <div className="flex items-center justify-between mb-4">
          <span className={cn(
            "inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border",
            style.bg, style.text, style.border
          )}>
            {getEventIcon(event)}
            <span className="capitalize">{event.isBirthday ? "Birthday" : event.type}</span>
          </span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <h2 className="font-serif text-xl font-bold text-foreground leading-tight mb-3">
          {event.title}
        </h2>

        <div className="space-y-2">
          {event.time && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4 shrink-0" />
              <span>
                {formatTime(event.time)}
                {event.endTime && ` – ${formatTime(event.endTime)}`}
              </span>
            </div>
          )}
          {event.location && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4 shrink-0" />
              <span>{event.location}</span>
            </div>
          )}
          {event.courseName && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <BookOpen className="h-4 w-4 shrink-0" />
              <span>{event.courseName}</span>
            </div>
          )}
        </div>

        {/* Date */}
        <div className="mt-4 pt-3 border-t border-border">
          <p className="text-xs text-muted-foreground">
            {new Date(event.date).toLocaleDateString("en-US", {
              weekday: "long", month: "long", day: "numeric", year: "numeric",
            })}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function CalendarLegend() {
  const entries = [
    { label: "Class", style: EVENT_STYLES.class },
    { label: "Assessment", style: EVENT_STYLES.assessment },
    { label: "Task", style: EVENT_STYLES.task },
    { label: "Event", style: EVENT_STYLES.event },
    { label: "Birthday", style: EVENT_STYLES.birthday },
  ];
  return (
    <div className="p-3 border-t border-border">
      <p className="text-[0.6rem] uppercase tracking-widest font-medium text-muted-foreground mb-2">Categories</p>
      <div className="space-y-1.5">
        {entries.map(({ label, style }) => (
          <div key={label} className="flex items-center gap-2">
            <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", style.dot)} />
            <span className="text-xs text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main CalendarView ────────────────────────────────────────────────────────

export function CalendarView() {
  const [view, setView] = useState<CalendarView>("week");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [today] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()));
  const [currentMonth, setCurrentMonth] = useState(() => new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showDetailPanel, setShowDetailPanel] = useState(false);

  // Touch / swipe state
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  // Fetch events for current view range
  const fetchEvents = useCallback(async (year: number, month: number) => {
    setLoading(true);
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month + 2, 0);
    const result = await getCalendarEventsAction(
      startOfMonth.toISOString(),
      endOfMonth.toISOString()
    );
    setEvents(result.events as unknown as CalendarEvent[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchEvents(currentYear, currentMonth);
  }, [currentYear, currentMonth, fetchEvents]);

  // Events by date map
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const event of events) {
      const key = event.date.slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(event);
    }
    return map;
  }, [events]);

  // Selected day events
  const selectedDayEvents = useMemo(() => {
    const key = toDateStr(selectedDate);
    return eventsByDate[key] || [];
  }, [eventsByDate, selectedDate]);

  // Navigation
  function navigatePrev() {
    if (view === "week") {
      const newStart = addDays(weekStart, -7);
      setWeekStart(newStart);
      setCurrentMonth(newStart.getMonth());
      setCurrentYear(newStart.getFullYear());
    } else if (view === "day") {
      const newDate = addDays(selectedDate, -1);
      setSelectedDate(newDate);
      setCurrentMonth(newDate.getMonth());
      setCurrentYear(newDate.getFullYear());
    } else {
      const newMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const newYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      setCurrentMonth(newMonth);
      setCurrentYear(newYear);
    }
  }

  function navigateNext() {
    if (view === "week") {
      const newStart = addDays(weekStart, 7);
      setWeekStart(newStart);
      setCurrentMonth(newStart.getMonth());
      setCurrentYear(newStart.getFullYear());
    } else if (view === "day") {
      const newDate = addDays(selectedDate, 1);
      setSelectedDate(newDate);
      setCurrentMonth(newDate.getMonth());
      setCurrentYear(newDate.getFullYear());
    } else {
      const newMonth = currentMonth === 11 ? 0 : currentMonth + 1;
      const newYear = currentMonth === 11 ? currentYear + 1 : currentYear;
      setCurrentMonth(newMonth);
      setCurrentYear(newYear);
    }
  }

  function goToToday() {
    const now = new Date();
    setSelectedDate(now);
    setWeekStart(getWeekStart(now));
    setCurrentMonth(now.getMonth());
    setCurrentYear(now.getFullYear());
  }

  function handleSelectDate(date: Date) {
    setSelectedDate(date);
    setCurrentMonth(date.getMonth());
    setCurrentYear(date.getFullYear());
    setShowDetailPanel(true);
    if (view === "month") {
      setShowDetailPanel(true);
    }
  }

  function handleMiniCalendarMonthChange(delta: number) {
    const newDate = new Date(currentYear, currentMonth + delta, 1);
    setCurrentMonth(newDate.getMonth());
    setCurrentYear(newDate.getFullYear());
    if (view === "month") {
      // also update main view
    }
  }

  // Swipe navigation
  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx < 0) navigateNext();
      else navigatePrev();
    }
    touchStartX.current = null;
    touchStartY.current = null;
  }

  // Header label
  const headerLabel = useMemo(() => {
    if (view === "week") {
      const weekEnd = addDays(weekStart, 6);
      if (weekStart.getMonth() === weekEnd.getMonth()) {
        return `${MONTH_NAMES[weekStart.getMonth()]} ${weekStart.getFullYear()}`;
      }
      return `${MONTH_NAMES[weekStart.getMonth()].slice(0, 3)} – ${MONTH_NAMES[weekEnd.getMonth()].slice(0, 3)} ${weekEnd.getFullYear()}`;
    }
    if (view === "day") {
      return `${MONTH_NAMES[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`;
    }
    return `${MONTH_NAMES[currentMonth]} ${currentYear}`;
  }, [view, weekStart, selectedDate, currentMonth, currentYear]);

  if (loading) return <CalendarSkeleton />;

  return (
    <div
      className="flex flex-col gap-0 -mx-4 sm:-mx-6 md:-mx-8"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* ── Top toolbar ── */}
      <div className="flex items-center justify-between px-4 sm:px-6 md:px-8 py-3 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-30">
        {/* Left: month/year + navigation */}
        <div className="flex items-center gap-2">
          <h2 className="font-serif text-lg font-bold text-foreground mr-1 min-w-[160px]">
            {headerLabel}
          </h2>
          <div className="flex items-center border border-border rounded-lg overflow-hidden">
            <button
              onClick={navigatePrev}
              className="p-1.5 hover:bg-accent transition-colors"
              aria-label="Previous"
            >
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
            </button>
            <button
              onClick={navigateNext}
              className="p-1.5 hover:bg-accent transition-colors border-l border-border"
              aria-label="Next"
            >
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <button
            onClick={goToToday}
            className="hidden sm:inline-flex items-center text-xs font-medium px-3 py-1.5 rounded-lg border border-border hover:bg-accent transition-colors"
          >
            Today
          </button>
        </div>

        {/* Right: view switcher */}
        <div className="flex items-center bg-muted rounded-lg p-0.5 gap-0.5">
          {(["day", "week", "month"] as CalendarView[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-all capitalize",
                view === v
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {v === "day" ? <span className="sm:hidden"><CalendarDays className="h-3.5 w-3.5" /></span> : null}
              <span className={v === "day" ? "hidden sm:inline" : ""}>{v}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Main area ── */}
      <div className="flex flex-row" style={{ height: "calc(100vh - 220px)", minHeight: 480 }}>
        {/* Main calendar panel */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-border overflow-hidden">
          {view === "week" && (
            <WeekView
              weekStart={weekStart}
              eventsByDate={eventsByDate}
              today={today}
              selectedDate={selectedDate}
              onSelectDate={handleSelectDate}
              onSelectEvent={setSelectedEvent}
            />
          )}
          {view === "day" && (
            <DayView
              date={selectedDate}
              eventsByDate={eventsByDate}
              today={today}
              onSelectEvent={setSelectedEvent}
            />
          )}
          {view === "month" && (
            <MonthView
              year={currentYear}
              month={currentMonth}
              eventsByDate={eventsByDate}
              today={today}
              selectedDate={selectedDate}
              onSelectDate={handleSelectDate}
              onSelectEvent={setSelectedEvent}
            />
          )}
        </div>

        {/* Right sidebar — hidden on mobile, visible on lg+ */}
        <div className="hidden lg:flex flex-col w-64 shrink-0 bg-background overflow-hidden">
          {/* Mini calendar */}
          <MiniCalendar
            year={currentYear}
            month={currentMonth}
            selectedDate={selectedDate}
            today={today}
            eventsByDate={eventsByDate}
            onSelectDate={handleSelectDate}
            onChangeMonth={handleMiniCalendarMonthChange}
          />

          <div className="border-t border-border flex-1 overflow-hidden flex flex-col">
            <DayDetailPanel
              date={selectedDate}
              events={selectedDayEvents}
              onSelectEvent={setSelectedEvent}
            />
          </div>

          <CalendarLegend />
        </div>
      </div>

      {/* Mobile: day detail bottom sheet */}
      {showDetailPanel && (
        <div className="lg:hidden fixed inset-0 z-40 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowDetailPanel(false)}
          />
          <div className={cn(
            "relative bg-card rounded-t-2xl border-t border-border shadow-2xl max-h-[70vh] flex flex-col",
            "animate-in slide-in-from-bottom-4 duration-300"
          )}>
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>
            <div className="flex-1 overflow-hidden">
              <DayDetailPanel
                date={selectedDate}
                events={selectedDayEvents}
                onSelectEvent={(e) => { setSelectedEvent(e); setShowDetailPanel(false); }}
                onClose={() => setShowDetailPanel(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Mobile today button (floating) */}
      <button
        onClick={goToToday}
        className="sm:hidden fixed bottom-24 right-4 z-30 px-4 py-2 bg-primary text-primary-foreground rounded-full text-xs font-semibold shadow-lg"
      >
        Today
      </button>

      {/* Event detail modal */}
      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}
