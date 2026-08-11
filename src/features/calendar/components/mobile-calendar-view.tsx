"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import type { CalendarEvent } from "@/types";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type CalendarViewType,
  MONTH_NAMES,
  FULL_DAY_NAMES,
  addDays,
  getWeekStart,
  isSameDay,
  toDateStr,
  formatTime,
  getEventStyle,
  MonthView,
  MobileWeekStrip,
  DayDetailPanel,
} from "./calendar-view";

// ─── Constants ────────────────────────────────────────────────────────────────

const VIEW_ORDER: CalendarViewType[] = ["month", "week", "day"];
const SWIPE_THRESHOLD = 80;

// ─── Mobile Event List (iOS-style) ────────────────────────────────────────────

function MobileEventList({
  date,
  events,
  onSelectEvent,
}: {
  date: Date;
  events: CalendarEvent[];
  onSelectEvent: (e: CalendarEvent) => void;
}) {
  const timedEvents = events
    .filter((e) => e.time)
    .sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  const allDayEvents = events.filter((e) => !e.time);

  const today = new Date();
  const isToday = isSameDay(date, today);
  const tomorrow = addDays(today, 1);
  const isTomorrow = isSameDay(date, tomorrow);

  const dateLabel = (() => {
    if (isToday) return "TODAY";
    if (isTomorrow) return "TOMORROW";
    return FULL_DAY_NAMES[date.getDay()]?.toUpperCase();
  })();

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <CalendarDays className="h-8 w-8 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">No events</p>
        <p className="text-xs text-muted-foreground/50 mt-1">Enjoy your free time!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* All-day events */}
      {allDayEvents.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold text-primary">{dateLabel}</span>
            <span className="text-[0.65rem] text-muted-foreground">
              {date.getMonth() + 1}/{date.getDate()}/{date.getFullYear()}
            </span>
          </div>
          <div className="space-y-0">
            {allDayEvents.map((event) => (
              <MobileEventRow
                key={event.id}
                event={event}
                onClick={() => onSelectEvent(event)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Timed events */}
      {timedEvents.length > 0 && (
        <div>
          {allDayEvents.length === 0 && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-primary">{dateLabel}</span>
              <span className="text-[0.65rem] text-muted-foreground">
                {date.getMonth() + 1}/{date.getDate()}/{date.getFullYear()}
              </span>
            </div>
          )}
          <div className="space-y-0">
            {timedEvents.map((event) => (
              <MobileEventRow
                key={event.id}
                event={event}
                onClick={() => onSelectEvent(event)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MobileEventRow({
  event,
  onClick,
}: {
  event: CalendarEvent;
  onClick: () => void;
}) {
  const style = getEventStyle(event);

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left flex items-center gap-3 py-2.5 border-b border-border/50",
        "hover:bg-accent/30 transition-colors active:bg-accent/50"
      )}
    >
      {/* Color dot */}
      <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", style.dot)} />

      {/* Time range */}
      <span className="text-xs text-muted-foreground w-28 shrink-0 tabular-nums">
        {event.time && formatTime(event.time)}
        {event.time && event.endTime && " – "}
        {event.endTime && formatTime(event.endTime)}
        {!event.time && !event.endTime && "All Day"}
      </span>

      {/* Event title */}
      <span className="text-sm font-medium text-foreground truncate">
        {event.title}
      </span>
    </button>
  );
}

// ─── Mobile Calendar View (iOS-style) ────────────────────────────────────────

export function MobileCalendarView({
  events,
  loading,
  view,
  setView,
  today,
  selectedDate,
  setSelectedDate,
  weekStart,
  setWeekStart,
  currentMonth,
  setCurrentMonth,
  currentYear,
  setCurrentYear,
  eventsByDate,
  selectedDayEvents,
  setSelectedEvent,
  navigatePrev,
  navigateNext,
  goToToday,
  handleSelectDate,
}: {
  events: CalendarEvent[];
  loading: boolean;
  view: CalendarViewType;
  setView: (v: CalendarViewType) => void;
  today: Date;
  selectedDate: Date;
  setSelectedDate: (d: Date) => void;
  weekStart: Date;
  setWeekStart: (d: Date) => void;
  currentMonth: number;
  setCurrentMonth: (m: number) => void;
  currentYear: number;
  setCurrentYear: (y: number) => void;
  eventsByDate: Record<string, CalendarEvent[]>;
  selectedDayEvents: CalendarEvent[];
  setSelectedEvent: (e: CalendarEvent | null) => void;
  navigatePrev: () => void;
  navigateNext: () => void;
  goToToday: () => void;
  handleSelectDate: (d: Date) => void;
}) {
  // ── Touch state for swipe ──
  const touchStartY = useRef<number | null>(null);
  const touchStartX = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Header label ──
  const headerLabel = (() => {
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
  })();

  // ── Touch handlers for swipe navigation ──
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartY.current === null || touchStartX.current === null) return;

      const dy = e.changedTouches[0].clientY - touchStartY.current;
      const dx = e.changedTouches[0].clientX - touchStartX.current;

      // Horizontal swipe: navigate prev/next
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
        if (dx < 0) navigateNext();
        else navigatePrev();
      }

      // Vertical swipe: switch views
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > SWIPE_THRESHOLD) {
        const currentIdx = VIEW_ORDER.indexOf(view);
        if (dy < 0 && currentIdx < VIEW_ORDER.length - 1) {
          setView(VIEW_ORDER[currentIdx + 1]);
        } else if (dy > 0 && currentIdx > 0) {
          setView(VIEW_ORDER[currentIdx - 1]);
        }
      }

      touchStartY.current = null;
      touchStartX.current = null;
    },
    [view, setView, navigatePrev, navigateNext]
  );

  // ── Scroll to top when selected date changes ──
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [selectedDate]);

  return (
    <div
      className="flex flex-col h-full overflow-hidden select-none bg-background"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* ── Top toolbar ── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-background shrink-0">
        {/* Left: navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={navigatePrev}
            className="p-1.5 hover:bg-accent rounded-md transition-colors"
            aria-label="Previous"
          >
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <h2 className="font-serif text-base font-bold text-foreground min-w-[120px] text-center">
            {headerLabel}
          </h2>
          <button
            onClick={navigateNext}
            className="p-1.5 hover:bg-accent rounded-md transition-colors"
            aria-label="Next"
          >
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Right: Today + view switcher */}
        <div className="flex items-center gap-2">
          <button
            onClick={goToToday}
            className="text-xs font-medium px-2 py-1 rounded-md border border-border hover:bg-accent transition-colors"
          >
            Today
          </button>
          <div className="flex items-center bg-muted rounded-md p-0.5 gap-0.5">
            {VIEW_ORDER.map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "px-2 py-1 rounded text-xs font-medium transition-all capitalize",
                  view === v
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {v === "day" ? <CalendarDays className="h-3.5 w-3.5" /> : v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Calendar section (top ~40%) ── */}
      <div className="shrink-0 border-b border-border">
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
        {view === "week" && (
          <MobileWeekStrip
            weekStart={weekStart}
            eventsByDate={eventsByDate}
            today={today}
            selectedDate={selectedDate}
            onSelectDate={handleSelectDate}
          />
        )}
        {view === "day" && (
          <MobileWeekStrip
            weekStart={getWeekStart(selectedDate)}
            eventsByDate={eventsByDate}
            today={today}
            selectedDate={selectedDate}
            onSelectDate={handleSelectDate}
          />
        )}
      </div>

      {/* ── Event list section (bottom ~60%, scrollable) ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-none p-4">
        {view === "month" ? (
          <MobileEventList
            date={selectedDate}
            events={selectedDayEvents}
            onSelectEvent={setSelectedEvent}
          />
        ) : view === "week" ? (
          <WeekEventList
            weekStart={weekStart}
            eventsByDate={eventsByDate}
            onSelectEvent={setSelectedEvent}
          />
        ) : (
          <MobileEventList
            date={selectedDate}
            events={selectedDayEvents}
            onSelectEvent={setSelectedEvent}
          />
        )}
      </div>

      {/* ── Swipe hint (shown briefly) ── */}
      <SwipeHint />

      {/* ── Floating action button for adding events ── */}
      <button
        onClick={() => {
          // This will be handled by the parent CalendarView component
          // We'll dispatch a custom event to trigger the dialog
          window.dispatchEvent(new CustomEvent("open-event-creation"));
        }}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors"
        aria-label="Add Event"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
  );
}

// ─── Week Event List (events grouped by day for the current week) ────────────

function WeekEventList({
  weekStart,
  eventsByDate,
  onSelectEvent,
}: {
  weekStart: Date;
  eventsByDate: Record<string, CalendarEvent[]>;
  onSelectEvent: (e: CalendarEvent) => void;
}) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const sections = days
    .map((day) => {
      const dateStr = toDateStr(day);
      const dayEvents = eventsByDate[dateStr] || [];
      return { date: day, events: dayEvents };
    })
    .filter((s) => s.events.length > 0);

  if (sections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <CalendarDays className="h-8 w-8 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">No events this week</p>
        <p className="text-xs text-muted-foreground/50 mt-1">Enjoy your free time!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sections.map(({ date, events }) => {
        const isToday = isSameDay(date, today);
        const tomorrow = addDays(today, 1);
        const isTomorrow = isSameDay(date, tomorrow);

        const dateLabel = (() => {
          if (isToday) return "TODAY";
          if (isTomorrow) return "TOMORROW";
          return FULL_DAY_NAMES[date.getDay()]?.toUpperCase();
        })();

        return (
          <div key={toDateStr(date)}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-primary">{dateLabel}</span>
              <span className="text-[0.65rem] text-muted-foreground">
                {date.getMonth() + 1}/{date.getDate()}/{date.getFullYear()}
              </span>
            </div>
            <div className="space-y-0">
              {events
                .sort((a, b) => (a.time || "").localeCompare(b.time || ""))
                .map((event) => (
                  <MobileEventRow
                    key={event.id}
                    event={event}
                    onClick={() => onSelectEvent(event)}
                  />
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Swipe Hint Component ─────────────────────────────────────────────────────

function SwipeHint() {
  const [show, setShow] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShow(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  if (!show) return null;

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
      <div className="bg-foreground/80 text-background text-xs px-3 py-1.5 rounded-full animate-pulse">
        Swipe up/down to switch views
      </div>
    </div>
  );
}
