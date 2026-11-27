# Semester Setup, Academic Calendar & Timetable Guide

This document describes the Phase 7 semester-setup workflow built for entering a new semester, its academic calendar (holidays, breaks, exam periods, day-order swaps), and its weekly class timetable.

## Routes

- `/semesters/setup` — 5-step mobile-friendly Semester Setup Wizard (Basics → Courses → Academic Calendar → Timetable → Review). Drafts persist in `localStorage` until submitted.
- `/semesters/[id]/calendar` — Academic Calendar Manager + Import (deterministic text parser, hand-written `.ics` parser, AI parser with 8s timeout & Zod validation) + Convert Repeated Holidays helper.
- `/semesters/[id]/timetable` — Mobile-first Timetable Entry (course picker, weekday chips, duration presets 50/60/90/120m, overlap warnings, duplicate-to-other-days, bulk delete per course) + Timetable Import (CSV/TSV/plain text with header auto-detection, merged-cell carry-forward, 12h/24h times, and AI parser with review table).

## Occurrence Engine Precedence

`generateOccurrences` (`src/features/attendance/lib/occurrences.ts`) is the single pure engine used by attendance, briefs, notification scheduler, calendar views, and the `/today` dashboard.

For each date inside a semester's `[startDate, endDate]`:
1. **Class-level `ScheduleException` (`cancelled`)** wins for that specific class slot.
2. **Semester-wide `AcademicCalendarEntry` with `cancelsClasses = true`** (`holiday`, `break`, `exam_period`, `no_classes`) cancels all occurrences on that date (`status: "cancelled"`, `reason: entry.title`, excluded from attendance percentages).
3. **`AcademicCalendarEntry` with `kind = "follows_weekday"`** replaces that date's occurrences with the schedules of `followsWeekday` (`1 = Monday .. 7 = Sunday`); the native weekday's own classes do not occur, and attendance records attach to the replacing schedule.
4. **Normal** recurring weekly schedule (with any `rescheduled` `ScheduleException` overrides).

Entries outside the semester date range are ignored.

## Upcoming & Scheduleless Semester States

- When no semester is active and an upcoming semester has no timetable yet, `/today` displays a compact card (`"Semester starts in N days, timetable not added yet"`) with links to `/semesters/[id]/timetable` and `/semesters/[id]/calendar`.
- Daily briefs stay silent about classes when no timetable exists and emit a `"no_timetable"` nudge until schedules are added.
- Course schedule sections show `"No schedule yet"` when empty.

## Convert Repeated Holidays

On `/semesters/[id]/calendar`, **Convert repeated holidays** scans for dates where every class scheduled on that weekday has a `cancelled` `ScheduleException`, previews proposed `AcademicCalendarEntry` rows for review, and atomically creates the calendar entries while removing the redundant per-class exceptions.



## Phase 7b: Academic Calendar Everywhere & Importer Safety Net

- **Single Source:** `getAcademicEntriesForRange(userId, start, end)` (`src/features/semesters/lib/calendar-queries.ts`) and `entriesForDate(entries, date)` (`src/features/semesters/lib/academic-calendar-dates.ts`) serve `/api/academic-calendar`, `/calendar`, `/today`, and daily briefs. Entries from all overlapping semesters (past, active, upcoming) are included.
- **Main `/calendar`:** Month grid shows plain-text markers (`Holiday`, `Exams`, `Follows Mon`, etc.) and muted background on cancelled days; week, day, and mobile agenda views show all-day strips with full titles (`(day X of Y)` on multi-day ranges). Tapping opens the detail modal with `"Edit in academic calendar"`. Includes a `"Show academic calendar"` toggle (remembered in `localStorage`) and a non-blocking offline fallback.
- **`/today` & Briefs:** `/today` displays a compact academic summary card for today/tomorrow and an upcoming-semester first-class countdown (`"N days to the first class on <date>."`). Brief v2 includes academic entries in `timeline` and mentions holidays/exams/follows-weekday in `summary`.
- **`follows_weekday` Labels:** Calendar day headings explicitly display `"<Weekday>, follows <Target> timetable"` and expand the replaced weekday's classes through `generateOccurrences`.
- **Importer & Safety Net:** Fixed cross-month/cross-year textual ranges, bracket kind tag stripping, `follows_weekday` real weekday titles, and `Key Dates:` note sections. Import review shows explicit start/end dates, weekday impact preview (`"These entries cancel classes on N weekdays."`), and dismissible row warnings.
- **Audit Entries:** `/semesters/[id]/calendar` includes an `"Audit entries"` action with one-tap `"Fix end date"` and `"Clean title"` suggestions applied only on confirmation.
