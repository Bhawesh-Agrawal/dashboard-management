# Sync & Offline Storage Audit

Date: 2026-11-27
Branch: `phase-8-mobile-shell`

## Dexie (IndexedDB) Tables vs Server-Only Tables

| Table / Model | Stored in Dexie? | Sync Direction | Notes |
| --- | --- | --- | --- |
| `tasks` | Yes (`db.tasks`) | Bidirectional (`dirty=1` → `/api/sync/write`) | Used by `/today`, `/tasks`, `/calendar` |
| `courses` | Yes (`db.courses`) | Bidirectional | Used by `/today`, `/tasks`, `/calendar` |
| `notes` | Yes (`db.notes`) | Bidirectional | Used by `/notes`, `/notes/[id]` |
| `routines` | Yes (`db.routines`) | Bidirectional | Used by `/today`, `/routines` |
| `routineCompletions` | Yes (`db.routineCompletions`) | Pull + completion write | Used by `/today`, `/routines` |
| `events` | Yes (`db.events`) | Bidirectional | Used by `/calendar`, `/today` |
| `attendance` | Yes (`db.attendance`) | Pull only (marking is online-only) | Used by `/today` |
| `classSchedules` | Yes (`db.classSchedules`) | Bidirectional | Used by `/calendar`, `/today` |
| `assessments` | Yes (`db.assessments`) | Bidirectional | Used by `/calendar`, `/today` |
| `academicCalendarEntries` | No (server-only) | Lightweight range fetch (`/api/academic-calendar`) | Non-blocking `"Academic calendar unavailable offline"` fallback |
| `dailyBriefs` | No (server-only) | Server RSC / `/brief` | Read-only offline fallback |
| `dsa*`, `reviews`, `fileAttachments` | No (server-only) | Server Actions / S3 | Pinned PDFs cached via `PINNED_DOCUMENTS_CACHE` |

## Pages Reading Dexie vs Server

- **Dexie-backed:** `/today` (`TodayPageClient` + `/api/sync/dashboard`), `/tasks`, `/calendar` (`CalendarPageClient` + `/api/sync/calendar`), `/notes`, `/routines`.
- **Server-backed:** `/brief`, `/semesters`, `/semesters/[id]/calendar`, `/semesters/[id]/timetable`, `/semesters/setup`, `/courses/[id]`, `/dsa/*`, `/reviews`, `/settings`, `/more`.
