"use client";

import { useState, useRef, useCallback, useEffect } from "react";
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
  WeekView,
  DayView,
  MonthView,
  DayDetailPanel,
} from "./calendar-view";

// ─── Constants ────────────────────────────────────────────────────────────────

const VIEW_ORDER: CalendarViewType[] = ["month", "week", "day"];
const MIN_SPLIT = 30; // minimum percentage for calendar half
const MAX_SPLIT = 70; // maximum percentage for calendar half
const DEFAULT_SPLIT = 50; // default split percentage
const SWIPE_THRESHOLD = 80; // minimum vertical swipe distance to switch views
const DRAG_HANDLE_HEIGHT = 24; // height of the drag handle area in px

// ─── Mobile Calendar View ─────────────────────────────────────────────────────

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
  // ── Split state ──
  const [splitPercent, setSplitPercent] = useState(DEFAULT_SPLIT);
  const [isDragging, setIsDragging] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState<"calendar" | "events" | null>(null);

  // ── Touch state for swipe view switching ──
  const touchStartY = useRef<number | null>(null);
  const touchStartX = useRef<number | null>(null);
  const isSwiping = useRef(false);

  // ── Drag state ──
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number>(0);
  const dragStartSplit = useRef(DEFAULT_SPLIT);

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

  // ── Drag handlers ──
  const handleDragStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    isSwiping.current = false;

    if ("touches" in e) {
      dragStartY.current = e.touches[0].clientY;
    } else {
      dragStartY.current = e.clientY;
    }
    dragStartSplit.current = splitPercent;
  }, [splitPercent]);

  const handleDragMove = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return;

    const currentY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const deltaY = currentY - dragStartY.current;
    const containerHeight = containerRef.current.offsetHeight;
    const deltaPercent = (deltaY / containerHeight) * 100;

    const newSplit = Math.max(MIN_SPLIT, Math.min(MAX_SPLIT, dragStartSplit.current + deltaPercent));
    setSplitPercent(newSplit);
  }, [isDragging]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // ── Touch handlers for swipe view switching ──
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Don't interfere with drag handle
    if ((e.target as HTMLElement).closest("[data-drag-handle]")) return;

    touchStartY.current = e.touches[0].clientY;
    touchStartX.current = e.touches[0].clientX;
    isSwiping.current = false;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartY.current === null || touchStartX.current === null) return;
    if ((e.target as HTMLElement).closest("[data-drag-handle]")) return;

    const dy = e.changedTouches[0].clientY - touchStartY.current;
    const dx = e.changedTouches[0].clientX - touchStartX.current;

    // Only handle vertical swipes that are primarily vertical
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > SWIPE_THRESHOLD) {
      isSwiping.current = true;
      const currentViewIdx = VIEW_ORDER.indexOf(view);

      if (dy < 0 && currentViewIdx < VIEW_ORDER.length - 1) {
        // Swipe up → go to more detailed view (month → week → day)
        setView(VIEW_ORDER[currentViewIdx + 1]);
      } else if (dy > 0 && currentViewIdx > 0) {
        // Swipe down → go to less detailed view (day → week → month)
        setView(VIEW_ORDER[currentViewIdx - 1]);
      }
    }

    touchStartY.current = null;
    touchStartX.current = null;
  }, [view, setView]);

  // ── Double-tap to fullscreen ──
  const lastTap = useRef<number>(0);
  const handleDoubleClick = useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      // Double tap detected
      if (isFullscreen === null) {
        // If at default split, maximize calendar
        if (splitPercent === DEFAULT_SPLIT) {
          setIsFullscreen("calendar");
          setSplitPercent(MAX_SPLIT);
        } else if (splitPercent === MAX_SPLIT) {
          setIsFullscreen("events");
          setSplitPercent(MIN_SPLIT);
        } else {
          setIsFullscreen(null);
          setSplitPercent(DEFAULT_SPLIT);
        }
      } else {
        setIsFullscreen(null);
        setSplitPercent(DEFAULT_SPLIT);
      }
    }
    lastTap.current = now;
  }, [isFullscreen, splitPercent]);

  // ── Prevent scroll when dragging ──
  useEffect(() => {
    if (isDragging) {
      document.body.style.overflow = "hidden";
      document.body.style.touchAction = "none";
    } else {
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
    };
  }, [isDragging]);

  // ── Keyboard navigation for view switching ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const currentIdx = VIEW_ORDER.indexOf(view);
        if (currentIdx > 0) setView(VIEW_ORDER[currentIdx - 1]);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        const currentIdx = VIEW_ORDER.indexOf(view);
        if (currentIdx < VIEW_ORDER.length - 1) setView(VIEW_ORDER[currentIdx + 1]);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [view, setView]);

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full overflow-hidden select-none"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={handleDoubleClick}
    >
      {/* ── Top toolbar ── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-background/80 backdrop-blur-sm shrink-0">
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

      {/* ── Calendar half (top) ── */}
      <div
        className="overflow-hidden relative"
        style={{
          height: isFullscreen === "events" ? "0%" : `${isFullscreen === "calendar" ? 100 : splitPercent}%`,
          transition: isDragging ? "none" : "height 0.2s ease-out",
        }}
      >
        <div className="h-full overflow-hidden">
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
      </div>

      {/* ── Drag handle ── */}
      <div
        data-drag-handle
        onTouchStart={handleDragStart}
        onTouchMove={handleDragMove}
        onTouchEnd={handleDragEnd}
        onMouseDown={handleDragStart}
        onMouseMove={isDragging ? handleDragMove : undefined}
        onMouseUp={handleDragEnd}
        onMouseLeave={isDragging ? handleDragEnd : undefined}
        className={cn(
          "flex items-center justify-center shrink-0 cursor-grab active:cursor-grabbing",
          "bg-background border-y border-border hover:bg-accent/50 transition-colors",
          isDragging && "bg-accent/50"
        )}
        style={{ height: DRAG_HANDLE_HEIGHT }}
      >
        <div className={cn(
          "w-8 h-1 rounded-full transition-colors",
          isDragging ? "bg-primary/60" : "bg-border"
        )} />
      </div>

      {/* ── Events half (bottom) ── */}
      <div
        className="overflow-hidden relative"
        style={{
          height: isFullscreen === "calendar" ? "0%" : `${isFullscreen === "events" ? 100 : 100 - splitPercent}%`,
          transition: isDragging ? "none" : "height 0.2s ease-out",
        }}
      >
        <div className="h-full overflow-hidden">
          <DayDetailPanel
            date={selectedDate}
            events={selectedDayEvents}
            onSelectEvent={setSelectedEvent}
          />
        </div>
      </div>

      {/* ── Swipe hint (shown briefly) ── */}
      <SwipeHint />
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
