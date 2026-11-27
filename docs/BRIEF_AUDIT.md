# Daily Brief v1 Audit

Audit of the Phase 4/5 Daily Brief implementation (`src/features/briefs/` and `src/app/(app)/brief/page.tsx`) prior to Phase 6 (Brief v2).

---

## 1. Architecture & File Responsibilities

| File | Role |
| --- | --- |
| `src/features/briefs/lib/build.ts` | Pure payload builders (`buildMorningBriefPayload`, `buildEveningBriefPayload`) returning `BriefPayload` (`kind`, `forDate`, `weatherLine`, `earliestCommitment`, `sections[]`, `pushSummary`). |
| `src/features/briefs/lib/generate.ts` | Orchestrator (`generateAndPersistBrief`) querying Prisma (`semester`, `classSchedule`, `attendanceRecord`, `task`, `event`, `assessment`, `notificationPreference`), `getDsaDueSummary`, and `fetchWeatherLine`, then persisting via `saveDailyBrief`. |
| `src/features/briefs/lib/weather.ts` | Open-Meteo city search (`searchCities`) and daily weather line fetcher (`fetchWeatherLine`) with 3s timeout and 3h `WeatherCache` (`lat:lon:dateOnly`). |
| `src/features/briefs/lib/storage.ts` | Prisma persistence (`saveDailyBrief`, `getLatestDailyBriefs`, `getDailyBriefByDate`) in `daily_briefs` (`@@unique([userId, kind, forDate])`). |
| `src/features/briefs/lib/travel.ts` | Server actions for attaching/updating travel flags and `EventDocument` ticket links on `Event` rows (`isTravel`, `eventDocuments`). |
| `src/features/briefs/lib/pin-tickets.ts` | Pure 48h travel selector (`selectTravelEventsWithin48Hours`) and client-side offline PDF cache pinner (`pinTravelDocuments`). |
| `src/features/briefs/lib/actions.ts` | `regenerateBriefAction(kind)` server action revalidating `/brief` and `/today`. |
| `src/app/(app)/brief/page.tsx` | Server component loading `getLatestDailyBriefs(userId)` and rendering `<BriefView />`. |
| `src/features/briefs/components/brief-view.tsx` | Renders two `<BriefCard>` panels (Morning & Evening), triggers `pinTravelDocuments` on mount/update, and renders `weatherLine`, `earliestCommitment`, and `sections[]`. |
| `src/features/briefs/components/brief-today-card.tsx` | Compact card on `/today` showing `summary.pushSummary` and a link to `/brief`. |

---

## 2. What Data Each Section Reads

### Morning Brief (`buildMorningBriefPayload`)
1. **`classes` ("Today's Classes"):** Active semester (`currentSemesterWhere(userId, todayStr)`) → `classSchedule` for `dayOfWeek` matching `todayStr`, applying `scheduleException` (`cancelled` skipped, `rescheduled` overrides time/location). Max 8 items.
2. **`events` ("Today's Events"):** `prisma.event` where `dateTime` falls on `todayStr` (local timezone). Max 8 items. *(Does NOT read Google Calendar events.)*
3. **`tasks` ("Tasks Due & Overdue"):** Open `prisma.task` with `dueDate <= todayStr` (due today or overdue). Max 5 items.
4. **`travel` ("Upcoming Travel (48h)"):** `prisma.event` with `isTravel = true` within `[now, now + 48h]`, including linked `eventDocuments` (`note.id`, `title`, `fileName`, `s3Url`). Max 5 items.
5. **`dsa` ("DSA Revisions"):** `getDsaDueSummary(userId, now)` — only included if `isConfigured && (dueToday > 0 || overdue > 0)`.
6. **`assessments` ("Assessments (Next 3 Days)"):** `prisma.assessment` for user's courses with `date` in `[todayStr, todayStr + 3d]`. Max 5 items.

### Evening Brief (`buildEveningBriefPayload`)
1. **`unmarked_attendance` ("Unmarked Attendance Today"):** Count of today's classes in current semester lacking a non-`not_marked` `attendanceRecord`.
2. **`tomorrow_schedule` ("Tomorrow's Schedule"):** Merged `tomorrowClasses` (current semester) + `tomorrowEvents` (`prisma.event` only), sorted by time; also sets `earliestCommitment`. Max 8 items.
3. **`tasks_tomorrow` ("Tasks Due Tomorrow"):** Open `prisma.task` due on `tomorrowStr`. Max 5 items.
4. **`assessments_7d` ("Assessments (Next 7 Days)"):** `prisma.assessment` in `[todayStr, todayStr + 7d]`. Max 5 items.
5. **`travel_tomorrow` ("Travel Tomorrow"):** `prisma.event` with `isTravel = true` on `tomorrowStr`. Max 5 items.
6. **`dsa_tomorrow` ("DSA Revisions Tomorrow"):** Hardcoded to `0` in `generate.ts` (`tomorrowDsaDueCount: 0`), so this section is **never** emitted in practice.

---

## 3. Why a Brief Containing Only Weather Can Occur

Every section in `buildMorningBriefPayload` and `buildEveningBriefPayload` is gated by a strict non-empty check:
- `classes` / `tomorrow_schedule` require `hasCurrentSemester === true` (if a semester ended or none is active, classes are omitted completely with no explanation).
- `events` only checks local `prisma.event` rows (ignoring Google Calendar events).
- `tasks` only checks `dueDate <= todayStr` (morning) or `dueDate === tomorrowStr` (evening) — tasks due in 2–3 days are ignored.
- `dsa` is omitted whenever `dueToday === 0 && overdue === 0`, even if the user has an active DSA programme or recent attempts.
- `notes` and `routines` are never queried.
- There are no setup nudges (e.g., ended semester, missing city, disconnected Google Calendar).

Consequently, on any day without local `Event`s, due `Task`s, `Assessment`s, or due DSA revisions (or when the semester has ended), `payload.sections` is `[]`. `BriefCard` then renders only `weatherLine` followed by `"Nothing scheduled in this window."` — a brief containing only weather.

---

## 4. Where the Push Body Comes From

In `src/features/notifications/lib/scheduler.ts`:
- `generateMorningBriefCandidates` (lines 435–461) and `generateEveningBriefCandidates` (lines 501–527) call `generateAndPersistBrief({ userId, kind, now, timezone })`.
- **Notification `title`:** Hardcoded `"Morning Brief"` or `"Evening Brief"`.
- **Notification `body`:** Taken from `payload.pushSummary` (constructed deterministically in `build.ts`, e.g., `"Today: 3 classes, 2 tasks."` or `"Clear schedule today — open your morning brief."`).
- **Dedup:** Uses `buildDedupKey("morning_brief", "daily", local.dateOnly)` and `buildDedupKey("evening_brief", "daily", local.dateOnly)`.
- **Midday brief:** Does not exist in v1.

---

## 5. App Data Sources vs. Current Brief Coverage

| Data Source | Available in App | Used by Current Brief (v1)? | Gap / Notes |
| --- | --- | --- | --- |
| **Classes** (`ClassSchedule` + `ScheduleException`) | Yes | **Yes** (today / tomorrow) | Skipped silently if no current semester; no "next up" countdown or free-gap calculation. |
| **Local Events** (`Event`) | Yes | **Yes** (today / tomorrow) | Merged separately from classes; no unified timeline. |
| **Google Calendar Events** (`GoogleCalendarAccount` / `fetchGoogleCalendarEvents`) | Yes | **No** | Completely missing from both morning and evening briefs. |
| **Tasks** (`Task`) | Yes | **Partial** | Morning: due today/overdue only; Evening: tomorrow only. Tasks due within 2–3 days are missed. |
| **Assessments** (`Assessment`) | Yes | **Yes** (3d morning / 7d evening) | Included, but not integrated into a unified deadlines card. |
| **Travel & Tickets** (`Event.isTravel` + `EventDocument`) | Yes | **Partial** | Links shown, but no destination weather and no explicit offline-pinned indicator. |
| **DSA Tracker** (`getDsaDueSummary`, `DsaAttempt`, programme day) | Yes | **Partial** | Only shown if `dueToday > 0 || overdue > 0`; `tomorrowDsaDueCount` hardcoded to `0`; programme day and 7-day attempt count unused. |
| **Notes** (`Note`) | Yes | **No** | Recently edited notes are not surfaced. |
| **Semesters** (`Semester`) | Yes | **Partial** | Only checked as a boolean `hasCurrentSemester`; ended semester is never surfaced as an actionable nudge. |
| **Routines** (`Routine`, `RoutineLog`) | Yes | **No** | Not used in v1 brief. |
| **Weather** (`NotificationPreference` city + Open-Meteo) | Yes | **Partial** | Single summary string only; no current/feels-like, hourly strip, rain windows, UV, wind, visibility, AQI, or destination weather. |
