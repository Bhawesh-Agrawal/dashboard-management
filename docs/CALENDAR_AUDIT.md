# Calendar Audit: `calendar-view.tsx` vs `mobile-calendar-view.tsx`

Date: 2026-11-27
Branch: `phase-8-mobile-shell`

## Route Usage

- `/calendar` (`src/app/(app)/calendar/page.tsx`) → renders `CalendarPageClient` (`src/features/calendar/components/calendar-page-client.tsx`) → renders `CalendarView` (`src/features/calendar/components/calendar-view.tsx`).
- `CalendarView` checks `useIsMobile()` and delegates mobile rendering to `MobileCalendarView` (`src/features/calendar/components/mobile-calendar-view.tsx`). No other route imports `MobileCalendarView` directly.

## Feature & Behavior Comparison

| Behavior | `calendar-view.tsx` (Desktop) | `mobile-calendar-view.tsx` (Mobile) | Notes |
| --- | --- | --- | --- |
| Data fetching & Occurrence Engine | `fetchEvents` (`/api/sync/calendar` + `/api/academic-calendar`) | Passed from `CalendarView` | Both share the same `eventsByDate` map |
| Default view | `"week"` | `"week"` (`MobileWeekStrip` + `MobileEventList` / `WeekEventList`) | Mobile default should be day agenda + week strip, with month overview sheet |
| Month view | `MonthView` grid with academic markers + muted cancelled cells | Inline `MonthView` taking top ~40% of screen | Moving month view on mobile into a bottom `Sheet` frees vertical space for the agenda |
| Week navigation | Prev/Next buttons + swipe gestures on wrapper | Prev/Next buttons + `MobileWeekStrip` | Unify swipe + arrows in one component |
| Academic calendar toggle | `"Show academic calendar"` (`localStorage`) | Compact `"Acad"` button (`px-2 py-1`, < 44px) | Needs 44px+ target |
| Add Event button | `"Add Event"` button in top toolbar | Missing from mobile toolbar (relies only on global FAB) | Add `"Add"` button in unified mobile toolbar (`min-h-[44px]`) |
| Event detail view | `EventDetailModal` (centered modal with Travel toggle, note links, academic `"Edit in academic calendar"`) | Reuses `EventDetailModal` from `CalendarView` | On mobile, render detail as a bottom `Sheet` (`max-h-[85dvh]`) |
| Event creation | `EventCreationDialog` (`Dialog`) | Reuses `EventCreationDialog` | Support bottom-sheet layout on mobile |
| Follow-weekday day label | `"<Weekday>, follows <Target> timetable"` in `DayView` and `DayDetailPanel` | `"<Weekday>, follows <Target> timetable"` in `MobileEventList` | Preserve in unified day agenda |
