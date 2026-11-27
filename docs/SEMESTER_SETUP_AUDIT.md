# Phase 7 Semester Setup, Academic Calendar & Timetable Audit

Audit of how semesters, courses, class schedules, exceptions, and occurrences work prior to Phase 7.

---

## 1. Current Creation Flows & Mobile Needs

| Entity | Current UI & Entry Point | Server Action | Mobile Needs & Gaps |
| :--- | :--- | :--- | :--- |
| **Semester** | `CreateSemesterDialog` (`src/features/semesters/components/semester-form.tsx`), `EditSemesterDialog` (`src/features/semesters/components/edit-semester-dialog.tsx`) on `/semesters` | `createSemester`, `updateSemester`, `deleteSemester` (`src/features/semesters/lib/actions.ts`) | Basic modal form (`name`, `startDate`, `endDate`, `gradingScale`); no multi-step setup wizard, no draft persistence, no academic calendar step, no course copy helper. |
| **Course** | `CreateCourseDialog` (`src/features/courses/components/course-form.tsx`) on `/semesters/[id]` | `createCourse` (`src/features/courses/lib/actions.ts`) | Created one-by-one (`name`, `code`, `credits`, `color`, `targetAttendance`); no bulk copy from previous semester; no clear "No schedule yet" state when timetable isn't announced. |
| **Class Schedule** | `ScheduleSection` (`src/features/schedule/components/schedule-grid.tsx`) on `/courses/[id]` | `createClassSchedule`, `deleteClassSchedule` (`src/features/schedule/lib/actions.ts`) | Per-course form only (`dayOfWeek` single select, `startTime`, `endTime`, `location`). No multi-weekday selection, no duration presets, no overlap warning, no bulk CSV/text/AI timetable import, no semester-level timetable view. |
| **Holidays / Exceptions** | `ScheduleRow` inline exception buttons (`src/features/schedule/components/schedule-grid.tsx`) | `createScheduleException`, `deleteScheduleException` (`src/features/schedule/lib/actions.ts`) | Bound to `ScheduleException.classScheduleId` — cannot be entered before the timetable exists, and requires creating one exception per class per holiday. No support for `follows_weekday` day-order swaps or multi-day ranges (`break`, `exam_period`). |

---

## 2. Occurrence Engine (`src/features/attendance/lib/occurrences.ts`)

- `generateOccurrences(options)` is a pure function iterating UTC calendar days between `startDate` and `endDate` (defaulting to `semesterStartDate`..`semesterEndDate` or `todayStr` in `timezone`).
- For each date, it matches `schedules` by `DOW_NUMBER_TO_ENUM[cursorDate.getUTCDay()]`, filters by `effectiveStartDate`/`effectiveEndDate`, applies per-schedule `ScheduleException` (`cancelled` or `rescheduled`), attaches direct `AttendanceRecord`s (or unique-match legacy records with `classScheduleId: null`), and computes `timingStatus` via `getClassTimingStatus`.
- **Gap:** Does not accept semester-level `AcademicCalendarEntry` rows (`cancelsClasses`, `follows_weekday`).

---

## 3. All Schedule & Occurrence Consumers (Places That Must Change)

| Consumer | File(s) | Current Behaviour | Required Change in Phase 7 |
| :--- | :--- | :--- | :--- |
| **Attendance Engine & Calculations** | `src/features/attendance/lib/occurrences.ts`, `src/features/attendance/lib/calculations.ts`, `src/features/courses/lib/queries.ts` | Calls `generateOccurrences` with `schedules`, `exceptions`, `records` only. | Pass `calendarEntries` (from `AcademicCalendarEntry`) into `generateOccurrences`; cancelled occurrences (`cancelsClasses: true`) have `status: "cancelled"` and are excluded from attendance percentages; `follows_weekday` substitutes schedules for that date. |
| **Notification Scheduler** | `src/features/notifications/lib/scheduler.ts` (`generateClassStartCandidates`, `generateClassEndCandidates`) | Queries `prisma.classSchedule` + `exceptions` directly for `todayStr` day-of-week. | Use `generateOccurrences` (with `calendarEntries`) so holidays/breaks/exams suppress class reminders & attendance prompts, and `follows_weekday` fires reminders for the substituted weekday's classes. |
| **Daily Briefs** | `src/features/briefs/lib/generate.ts` (`getClassesForDate`) | Queries `prisma.classSchedule` + `exceptions` directly for `todayStr`/`tomorrowStr`. | Use `generateOccurrences` (with `calendarEntries`); if semester is upcoming or has 0 schedules, omit class commitments and surface a setup nudge until timetable exists. |
| **Today Dashboard & Sync** | `src/app/api/sync/dashboard/route.ts`, `src/features/dashboard/lib/queries.ts`, `src/features/dashboard/components/today-dashboard.tsx` | Queries `prisma.classSchedule` + `exceptions` for `todayDayOfWeek`. | Use `generateOccurrences` (with `calendarEntries`); show compact `"Semester starts in N days, timetable not added yet"` card when upcoming or scheduleless. |
| **Calendar View & Sync** | `src/app/api/sync/calendar/route.ts`, `src/features/calendar/lib/queries.ts` | Expands `classSchedule` in a raw `while (current <= endDate)` loop ignoring exceptions & calendar entries. | Use `generateOccurrences` (with `calendarEntries`) so calendar view reflects holidays, cancelled days, and `follows_weekday` swaps. |
| **Course Detail Page** | `src/app/(app)/courses/[id]/page.tsx`, `src/features/schedule/components/schedule-grid.tsx` | Shows `"No schedule set."` and `ScheduleSection`. | Ensure `"No schedule yet"` is shown cleanly when scheduleless, and `calendarEntries` flow into attendance/occurrence stats. |
| **Reviews Data Summary** | `src/features/reviews/lib/data-summary.ts` | Queries `classSchedule` counts; safe on empty arrays. | Verified safe on empty schedules (no crash). |
| **DSA Tracker** | `src/features/dsa/**` | Does not consume `classSchedule` or `AcademicCalendarEntry`. | None required. |
