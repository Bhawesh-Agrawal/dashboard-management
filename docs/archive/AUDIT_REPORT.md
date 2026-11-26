# Comprehensive Engineering Audit Report

**Repository:** `dashboard-management` (Academic Command Center)  
**Target Environment:** Next.js 16.2.10 / React 19.2.4 / Prisma 7.8.0 / Supabase Auth / GCP Cloud Run (Scale-to-Zero, 0-2 instances)  
**Target User Context:** Single user (owner), mobile-first PWA, located in Nepal (UTC+5:45)  
**Audit Date:** November 23, 2026  
**Mode:** Read-Only Static and Tooling Audit

---

## 1. Executive Summary & Health Scores

The application is an ambitious personal academic command center combining course tracking, attendance, assessments, notes with semantic linking, habit routines, calendar sync, and AI insights. However, the codebase suffers from severe architectural fragmentation, critical security vulnerabilities, data loss risks in offline synchronization, and unaddressed breaking changes in Next.js 16. Most critically: (1) a full Google Cloud service account private key (`sa_key.json`) is committed in plaintext; (2) Next.js 16 Proxy (`proxy.ts`) was placed in `src/app/proxy.ts` instead of `src/proxy.ts`, resulting in **zero middleware running** across the app; (3) `getCurrentUserId()` caches the user ID under a single global in-memory key for 5 minutes and falls back to `"default-user"`, completely breaking multi-request safety; (4) offline sync pushes attendance, schedules, and assessments to `/api/sync/write` which explicitly throws on them, while `seedAll()` wipes local Dexie tables on mount; (5) push notifications fire duplicate alerts because the 15-minute digest window overwrites individual dedup tags. 

| Audit Area | Health Score (0–100) | Status | Key Risk |
|---|:---:|---|---|
| 1. Notifications / Push | **28/100** | Critical Failure | Duplicate storms, broken digest tag dedup, missing dedup on 6 event types |
| 2. Auth & Data Access | **15/100** | Severe Vulnerability | Proxy not running, global cache poisoning, missing auth/ownership on 14+ action files |
| 3. Offline Sync | **22/100** | Data Loss Risk | Destructive `clear()` in seed, unhandled table writes in API, silent error swallows |
| 4. Attendance | **35/100** | Broken Model | No class materialization, single-session-per-day constraint, timezone day shifts |
| 5. File Upload & PDF | **30/100** | Mobile Unusable | Hardcoded private LAN IP (`192.168.101.10:9004`), 2 bundled PDF.js engines, unpkg worker |
| 6. Duplication & Dead Code | **42/100** | High Bloat | 253 code clones (7.64%), circular dependency in calendar, 37 schema models vs 28 documented |
| 7. AI Layer | **45/100** | Fragile & Exposed | 4 disconnected callers, 0 Zod schema validations, prompt injection via raw notes/PDFs |
| 8. Mobile UX | **40/100** | Degraded | Desktop modals instead of bottom sheets, FAB cluster overlays content, viewport zoom disabled |
| 9. Build, Deploy, Config | **25/100** | Security / Stability | Committed GCP private key, V8 OOM build without 4GB heap, Cloud Run 512MB RAM bottleneck |
| 10. Tests | **5/100** | Total Absence | 1 test file exists, 0 tests pass (fails trying to connect to live DB), 0% critical path coverage |

---

## 2. Findings Table

*Severity: P0 (Data Loss / Security Leak), P1 (Broken Core Feature), P2 (Degraded UX / Latency), P3 (Cleanup / Stale Code)*

| ID | Area | Severity | Status | File:Line | Description | Recommended Fix | Effort |
|---|---|---|---|---|---|---|:---:|
| **SEC-01** | Build/Deploy | **P0** | CONFIRMED | `sa_key.json:1-13` | GCP Service Account private key (`github-deployer`) committed in plaintext to repository. | Revoke key immediately in GCP IAM, delete file, scrub git history. | S |
| **SEC-02** | Auth | **P0** | CONFIRMED | `src/app/proxy.ts:1-56` | Next.js 16 Proxy misplaced at `src/app/proxy.ts` instead of `src/proxy.ts`; completely ignored by framework, meaning zero route protection is active. | Move to `src/proxy.ts` and verify execution on all non-static paths. | S |
| **SEC-03** | Auth | **P0** | CONFIRMED | `src/lib/auth.ts:7-15` | `getCurrentUserId()` caches user ID under single static key `"auth:userId"` for 5m on global `memCache`, poisoning subsequent user requests. | Remove `memCache` on user session; use React `cache()` per-request or directly read Supabase session. | S |
| **SEC-04** | Auth | **P0** | CONFIRMED | `src/features/attendance/lib/actions.ts:10-82` | Attendance server actions (`markAttendance`, `bulkMarkAttendance`, `getAttendanceSummary`) perform no authentication and no ownership checks. | Call authenticated `getCurrentUserId()` and verify course belongs to user's semester. | S |
| **SEC-05** | Auth | **P0** | CONFIRMED | `src/features/schedule/lib/actions.ts:6-95` | Class schedule and exception actions perform no authentication and no ownership checks. | Authenticate user and verify ownership of `courseId` / `classScheduleId`. | S |
| **SEC-06** | Auth | **P0** | CONFIRMED | `src/features/semesters/lib/actions.ts:6-60` | Semester mutations do not set `userId` (stored as NULL) and do not check ownership; `setActiveSemester` wipes active state globally. | Scope semesters to `userId` and enforce ownership in WHERE clauses. | M |
| **SEC-07** | Auth | **P0** | CONFIRMED | `src/app/api/notifications/trigger/route.ts:17` | `/api/notifications/trigger` skips auth check if `CRON_SECRET` environment variable is unset. | Enforce `if (!cronSecret \|\| secretParam !== cronSecret ...)` returning 401. | S |
| **SEC-08** | Auth | **P0** | CONFIRMED | `src/app/api/cron/daily-diagnostics/route.ts:19-25` | Diagnostic cron endpoint skips auth if `CRON_SECRET` is unset, and passes secret in GET URL query param. | Reject if `CRON_SECRET` missing; use `Authorization: Bearer` header only. | S |
| **SEC-09** | Auth | **P1** | CONFIRMED | `src/app/api/notifications/mark-opened/route.ts:21` | Endpoint accepts unauthenticated client-supplied `x-user-id` header without verifying user session. | Authenticate via Supabase session cookie instead of trusting header. | S |
| **SYNC-01** | Sync | **P0** | CONFIRMED | `src/lib/sync/sync-manager.ts:34-43` | `seedAll()` calls `db.*.clear()` on all Dexie tables. Triggered on mount if `taskCount === 0`, destroying all local offline edits. | Replace wipe with differential merge (`pullAll` pattern); never call `clear()`. | M |
| **SYNC-02** | Sync | **P0** | CONFIRMED | `src/app/api/sync/write/route.ts:268,318` | `/api/sync/write` only supports `tasks,courses,notes,routines,events`; throws `Unknown table` on attendance, classSchedules, assessments. | Remove unsupported tables from sync manager or implement write handlers. | M |
| **SYNC-03** | Sync | **P1** | CONFIRMED | `src/lib/sync/sync-manager.ts:227-274` | `pushDirtyAttendance`, `pushDirtyClassSchedules`, `pushDirtyAssessments` catch and swallow API throw; dirty rows loop forever. | Log errors, show UI sync-failed indicator, avoid infinite unhandled retry loops. | S |
| **SYNC-04** | Sync | **P1** | CONFIRMED | `src/lib/sync/sync-manager.ts:385-401` | `mergeTable()` only iterates server rows; server deletions are never propagated to client Dexie store, leaving zombie rows. | Implement soft-deletion tombstone tracking (`deletedAt`) in pull sync. | M |
| **NOTIF-01** | Notifications | **P0** | CONFIRMED | `src/features/notifications/lib/scheduler.ts:1568-1570,1640` | `buildDigestWindows` overwrites tags with `digest-...`, so `markNotificationSent` never records the original tag, causing continuous re-sends. | Record every individual constituent notification tag in `SentNotification`. | M |
| **NOTIF-02** | Notifications | **P1** | CONFIRMED | `src/features/notifications/lib/scheduler.ts:276-322` | Routine reminders do not check `wasNotificationSent()`; re-fires every cron cycle within time window. | Add `wasNotificationSent(userId, tag)` check and tag with date. | S |
| **NOTIF-03** | Notifications | **P1** | CONFIRMED | `src/features/notifications/lib/scheduler.ts:328-420` | Task notifications do not check `wasNotificationSent()`; re-fires within time window. | Add `wasNotificationSent(userId, tag)` check. | S |
| **NOTIF-04** | Notifications | **P1** | CONFIRMED | `src/features/notifications/lib/scheduler.ts:1343-1440` | Daily, weekly, and monthly review alerts do not check `wasNotificationSent()`. | Check `wasNotificationSent(userId, reviewTag)` before queuing notification. | S |
| **NOTIF-05** | Notifications | **P1** | CONFIRMED | `src/features/notifications/lib/scheduler.ts:238-246,477` | `getUserLocalTime` constructs Date from local parts then calls `toISOString().split('T')[0]`, converting back to UTC and corrupting Nepal date. | Use `Intl.DateTimeFormat` with formatting parts directly to construct local `YYYY-MM-DD` string. | M |
| **NOTIF-06** | Notifications | **P1** | CONFIRMED | `src/features/notifications/lib/scheduler.ts:1295-1301` | `sendPushNotifications` deduplicates to single most recent subscription per user; drops secondary devices/browsers. | Send push notifications to all active subscriptions of the user; clean up 404/410. | S |
| **NOTIF-07** | Notifications | **P2** | CONFIRMED | `src/features/notifications/lib/subscription.ts:23` | `id: subscription.endpoint.slice(-36)` forces non-UUID string into `@id @default(uuid())` column. | Allow Prisma to auto-generate UUID `id` and add `@@unique([endpoint])`. | S |
| **ATT-01** | Attendance | **P1** | CONFIRMED | `src/features/attendance/lib/actions.ts:15-28` | Attendance records are only created on demand; unmarked past classes do not exist in DB, rendering percentage calculations invalid. | Materialize calendar instances or compute attendance dynamically from schedule occurrences. | L |
| **ATT-02** | Attendance | **P1** | CONFIRMED | `prisma/schema.prisma:136` | `@@unique([courseId, date])` prohibits having more than one class session (e.g. lecture and lab) on the same day for a course. | Change schema unique constraint to `@@unique([classScheduleId, date])`. | L |
| **ATT-03** | Attendance | **P1** | CONFIRMED | `src/features/attendance/lib/actions.ts:19` | `new Date(data.date)` parses `"YYYY-MM-DD"` as UTC midnight, creating date mismatches across Nepal timezone (UTC+5:45). | Parse dates strictly as calendar dates (`YYYY-MM-DD`) without UTC conversion. | M |
| **ATT-04** | Attendance | **P2** | CONFIRMED | `src/features/courses/lib/actions.ts:60-86` | Manual attendance mode updates `manualPresent` and `manualTotalClasses`, but `Assessment` table attendance row is not updated. | Sync attendance calculation helper to check `attendanceMode === "manual"`. | S |
| **FILE-01** | Upload/PDF | **P0** | CONFIRMED | `src/lib/s3/client.ts:8,65` | S3 endpoint defaults to local LAN IP `http://192.168.101.10:9004`, completely unreachable from mobile devices on cellular networks. | Use public S3/Cloud Storage endpoint with valid public DNS and HTTPS. | M |
| **FILE-02** | Upload/PDF | **P1** | CONFIRMED | `src/lib/s3/actions.ts:97` | Server action `uploadFile` buffers entire file in memory via `file.arrayBuffer()`, causing Cloud Run 512MB container OOM. | Deprecate server buffering; use direct client-to-storage presigned PUT URLs. | M |
| **FILE-03** | Upload/PDF | **P1** | CONFIRMED | `package.json:47-48` | App bundles two conflicting major versions of `pdfjs-dist`: `4.10.38` (highlighter) and `5.4.296` (react-pdf). | Consolidate onto a single lightweight PDF renderer or use native browser embed. | L |
| **FILE-04** | Upload/PDF | **P1** | CONFIRMED | `src/lib/pdf/setup.ts:13` | PDF worker loaded from external unpkg CDN URL at runtime; completely fails when offline. | Bundle worker locally in `public/` or use standard worker configuration. | S |
| **FILE-05** | Upload/PDF | **P2** | CONFIRMED | `src/features/files/components/FileUploadDialog.tsx` & `src/features/notes/components/DocumentUploadDialog.tsx` | Multiple near-duplicate file upload dialog components with diverging logic. | Delete duplicate dialogs and standardize on one minimal upload component. | M |
| **AI-01** | AI Layer | **P1** | CONFIRMED | `src/features/ask/lib/actions.ts:42-45` | Raw note content and OCR text interpolated directly into prompt without delimiter boundaries; vulnerable to prompt injection. | Wrap user content in strict XML delimiters `<user_context>` and add sanitization. | M |
| **AI-02** | AI Layer | **P1** | CONFIRMED | `src/features/insights/lib/ai-insights.ts:85-115` & `reviews/lib/generator.ts:70-85` | AI responses parsed using brittle regex and `JSON.parse` with no Zod schema validation; prone to runtime crashes. | Validate all AI completions with `zod` schemas (`safeParse`). | M |
| **CODE-01** | Duplication | **P2** | CONFIRMED | `src/features/calendar/components/calendar-view.tsx` & `mobile-calendar-view.tsx` | Circular dependency confirmed by `madge` between desktop `calendar-view.tsx` and `mobile-calendar-view.tsx`. | Extract shared constants, styles, and sub-components into `calendar-shared.tsx`. | M |
| **CODE-02** | Duplication | **P2** | CONFIRMED | `src/features/tasks/components/TaskForm.tsx` & `src/features/tasks/components/task-form.tsx` | Duplicate task forms with divergent props and styling. | Consolidate into a single mobile-first TaskForm component; delete the other. | S |
| **BLD-01** | Build/Deploy | **P1** | CONFIRMED | `package.json:7` (`npm run build`) | `next build` crashes with V8 Out of Memory during compilation unless `NODE_OPTIONS=--max-old-space-size=4096` is set. | Add `NODE_OPTIONS` to build script and fix asset bundling bloat. | S |
| **BLD-02** | Build/Deploy | **P2** | CONFIRMED | `cloudbuild.yaml:34-35` | Cloud Run configured with only 512MiB memory and 1 vCPU; heavy runtime dependencies (`tesseract.js`, `googleapis`, `pdfjs-dist`) crash under load. | Increase memory to 1GiB or 2GiB, or prune heavy runtime packages. | S |
| **BLD-03** | Build/Deploy | **P2** | CONFIRMED | `src/lib/prisma.ts:18` | PostgreSQL connection pooler config explicitly disables SSL verification (`rejectUnauthorized: false`). | Enable proper CA verification for production database connection. | S |
| **BLD-04** | Build/Deploy | **P2** | CONFIRMED | `next.config.ts:1-16` | No Content Security Policy (CSP) or standard HTTP security headers configured. | Add security headers (HSTS, CSP, X-Frame-Options, X-Content-Type-Options). | S |
| **BLD-05** | Build/Deploy | **P3** | CONFIRMED | `temp_migration.sql:1-49` & `vercel.json:1` | Unused migration script and stale empty Vercel configuration file left in repo root. | Delete files. | S |
| **UX-01** | Mobile UX | **P2** | CONFIRMED | `src/app/layout.tsx:40` | Viewport sets `maximumScale: 1` and omits `viewportFit: "cover"`, breaking WCAG pinch-to-zoom and iOS safe area padding. | Set `viewportFit: "cover"` and remove `maximumScale: 1`. | S |
| **UX-02** | Mobile UX | **P2** | CONFIRMED | `src/components/layout/fab-cluster.tsx:188` | FAB cluster button hardcoded to `bottom: max(7rem, ...)`; floats awkwardly in upper screen half on 360px devices. | Position FAB cleanly above bottom tab bar (`bottom-20`). | S |
| **TEST-01** | Tests | **P1** | CONFIRMED | `src/features/knowledge-graph/lib/__tests__/traversal.test.ts:41` | Only test in project fails unconditionally because it attempts to query a live database with unconfigured credentials. | Add mock Prisma client or in-memory SQLite/pg-mem test harness. | M |

---

## 3. Architecture Maps

### 3.1. Notification Map (Area 1)

| Event | Code Paths Capable of Firing | Live / Dead / Duplicate Status | Dedup Tag Mechanism | Timezone Handling | Recommended Canonical Path |
|---|---|---|---|---|---|
| **Class Starting Soon** (`class_start`) | 1. `scheduler.ts:generateClassNotifications`<br>2. Cloud Scheduler `notifications` -> `/api/notifications/trigger` | **Live** (fires via cron trigger every 5 min) | `class-{id}-{YYYY-MM-DD}` (broken by digest batching) | Converts local time parts to Date, calls `toISOString()` (shifts on UTC date line) | **Keep canonical in scheduler**: Triggered by Cloud Scheduler every 5 min; fix digest tag loss and local date formatting. |
| **Class Ended (Mark Attendance)** (`class_end`) | 1. `scheduler.ts:generateClassEndNotifications`<br>2. Cloud Scheduler `notifications` -> `/api/notifications/trigger` | **Live** (fires after class end time) | `attendance-{courseId}-{YYYY-MM-DD}` (broken by digest batching) | Same UTC shift issue | **Keep canonical in scheduler**: Fix dedup tag retention and link directly to interactive attendance action. |
| **Class Cancelled** (`class_cancelled`) | 1. `scheduler.ts:generateClassCancellationNotifications`<br>2. `schedule/actions.ts:createScheduleException` | **Duplicate / Split**: Scheduler scans exceptions, but server action also marks attendance. | `exception-cancelled-{id}-{YYYY-MM-DD}` | Same UTC shift issue | **Canonical**: Fire immediately inside `createScheduleException` server action, or scan in 5m scheduler. |
| **Class Rescheduled** (`class_rescheduled`) | 1. `scheduler.ts:generateClassRescheduleNotifications`<br>2. `schedule/actions.ts:createScheduleException` | **Live** in scheduler | `exception-rescheduled-{id}-{YYYY-MM-DD}` | Same UTC shift issue | **Canonical**: Handled by scheduler. |
| **Routine Reminder** (`routine_reminder`) | 1. `scheduler.ts:generateRoutineReminders`<br>2. Cloud Scheduler `notifications` | **Live with duplicate bug**: Fires every 5 min within window because **no dedup check exists**. | None (`routine-{id}` generated but never checked in DB) | Matches `HH:mm` in user local window | **Canonical**: Add `wasNotificationSent(userId, 'routine-${id}-${date}')` check. |
| **Task Due Date** (`task_due`) | 1. `scheduler.ts:generateTaskNotifications`<br>2. Cloud Scheduler `notifications` | **Live with duplicate bug**: No dedup check; checks only 09:00 window. | None (`tasks-due-today` tag never checked in DB) | Compares against `userLocalTime.getHours() === 9` | **Canonical**: Merge into planned Morning Brief push notification. |
| **Overdue Task** (`overdue_task`) | 1. `scheduler.ts:generateOverdueTaskNotifications`<br>2. Cloud Scheduler `notifications` | **Live with duplicate bug**: No dedup check. | None (`tasks-overdue` tag never checked in DB) | Compares against local 09:00 | **Canonical**: Merge into Morning Brief. |
| **Daily Summary** (`daily_summary`) | 1. `scheduler.ts:generateDailySummary`<br>2. Cloud Scheduler `notifications` | **Live**: Checks user configured summary time (default 19:00). | Checked internally per section, but digest tag overrides it. | Uses user preferred timezone string | **Canonical**: Replace with planned Evening Brief push notification. |
| **Morning / Daily Review Ready** (`review_daily`) | 1. `scheduler.ts:generateDailyReviewAlert`<br>2. `api/cron/insights` (generates review directly) | **Dead / Stale Alert**: Reviews are generated at 07:00 UTC by diagnostics cron; alert fires at 08:00 local time without dedup. | Static `review-daily` (never checked in DB) | Checks 08:00 window | **Canonical**: Send push notification immediately upon generation in Morning Brief job. |
| **Weekly Review Ready** (`review_weekly`) | 1. `scheduler.ts:generateWeeklyReviewAlert`<br>2. `api/cron/reviews` | **Duplicate / Stale**: Generated Sunday 20:00 UTC; alert fires next morning at 08:00. | Static `review-weekly` (never checked in DB) | Checks 08:00 window | **Canonical**: Send push notification directly at conclusion of weekly review generator. |

---

### 3.2. Offline Sync Map (Area 3)

| Table | Dexie Schema | `/api/sync/write` Handling | Server Action Mutation Path | Conflict Resolution Strategy | Recommendation |
|---|---|---|---|---|---|
| **tasks** | `id, userId, title, status, dueDate, priority, courseId, projectId, domainId, dirty, _deleted` | Handled (`switch 'tasks'` upserts/deletes) | `createTask`, `updateTask`, `deleteTask` in `tasks/lib/actions.ts` | Last-write-wins based on `updatedAt` (Dexie checks `new Date(incoming) > new Date(local)`) | **Keep**: Core task list benefits from offline capture. Remove energy fields. |
| **courses** | `id, semesterId, name, credits, attendanceMode, dirty, _deleted` | Handled (`switch 'courses'` upserts/deletes) | `createCourse`, `updateCourse`, `deleteCourse` in `courses/lib/actions.ts` | Last-write-wins | **Simplify / Remove Sync**: Courses change rarely (start of semester). Server actions with React Server Components are cleaner. |
| **notes** | `id, userId, title, content, courseId, taskId, folderId, dirty, _deleted` | Handled (`switch 'notes'` upserts/deletes) | `createNote`, `updateNote`, `deleteNote` in `notes/lib/actions.ts` | Last-write-wins (no field-level diffing; risk of overwriting note text) | **Keep**: Essential for mobile note taking in lecture halls with bad connectivity. |
| **routines** | `id, userId, name, timeOfDay, specificTime, activeDays, dirty, _deleted` | Handled (`switch 'routines'` upserts/deletes) | `createRoutine`, `updateRoutine`, `deleteRoutine` in `routines/lib/actions.ts` | Last-write-wins | **Simplify**: Keep local Dexie for routine check-offs; remove identity relations. |
| **events** | `id, userId, title, dateTime, location, notes, eventType, dirty, _deleted` | Handled (`switch 'events'` upserts/deletes) | `google-actions.ts` (Google Calendar) | Last-write-wins | **Keep**: Calendar viewing offline is useful. |
| **routineCompletions**| `id, routineId, date, completedAt` | **Not handled** in `/api/sync/write` | `toggleRoutineCompletion` in `routines/lib/actions-completions.ts` | Pulled from server only; completions pushed via dedicated action | **Keep**: Low-overhead toggle. |
| **attendance** | `id, courseId, date, status, dirty, _deleted` | **THROWS 500** (`Unknown table: attendance`) | `markAttendance`, `bulkMarkAttendance` in `attendance/lib/actions.ts` | **Completely broken**: Sync manager attempts `apiWrite('attendance')`, errors are swallowed in empty catch block. | **Remove Offline Sync**: Attendance should use direct optimistic Server Action with fallback toast. |
| **classSchedules**| `id, courseId, dayOfWeek, startTime, endTime, dirty, _deleted` | **THROWS 500** (`Unknown table: classSchedules`) | `createClassSchedule`, `updateClassSchedule` in `schedule/lib/actions.ts` | **Completely broken**: Sync manager attempts `apiWrite('classSchedules')`, errors swallowed. | **Remove Offline Sync**: Schedules are static weekly definitions; mutate via Server Actions. |
| **assessments** | `id, courseId, componentType, maxMarks, obtainedMarks, dirty, _deleted` | **THROWS 500** (`Unknown table: assessments`) | `createAssessment`, `updateAssessment` in `assessments/lib/actions.ts` | **Completely broken**: Sync manager attempts `apiWrite('assessments')`, errors swallowed. | **Remove Offline Sync**: Grade entry is infrequent; server actions are sufficient. |

---

## 4. Removal Inventory

### 4.1. Features Slated for Removal

#### 1. Energy Sequencing & Energy Fields
- **Prisma Schema (`prisma/schema.prisma`)**:
  - `Task`: `energyRequirement` (line 217), `estimatedDuration` (line 218), `optimalTimeOfDay` (line 219), `sortPriority` (line 220).
  - `Routine`: `energyImpact` (line 479).
  - `Person`: `energyImpact` (line 751).
  - Enum `EnergyImpact` (`charging`, `draining`, `neutral`) (lines 699-703).
- **API Routes**:
  - `src/app/api/sync/seed/route.ts:17, 116-119`: References `sortPriority`, `energyRequirement`, `optimalTimeOfDay`.
  - `src/app/api/sync/write/route.ts:88-91, 104-107`: Upserts energy fields on Task.
- **Components & Forms**:
  - `src/features/tasks/components/TaskForm.tsx:19, 81, 193-197, 313-317`: "Best Time" / `optimalTimeOfDay` field inputs.
  - `src/features/tasks/components/task-form.tsx:44`: `optimalTimeOfDay` form binding.
  - `src/features/tasks/components/edit-task-dialog.tsx:45`: `optimalTimeOfDay` binding.
  - `src/components/layout/fab-cluster.tsx:95`: `optimalTimeOfDay` parameter in task creation.
- **Server Actions & Queries**:
  - `src/features/tasks/lib/actions.ts:48, 73, 98, 136`: `optimalTimeOfDay` input parameters and prisma update calls.
  - `src/features/tasks/lib/queries.ts:28, 64, 85`: `orderBy: { sortPriority: ... }`.
  - `src/lib/sync/db.ts:18, 20, 21`: Dexie `SyncTask` interface fields.
  - `src/lib/sync/hooks.ts:174, 205-208, 691-696`: `sortPriority` sorting algorithm in `useTasks`.
- **Reviews & AI Layer**:
  - `src/features/reviews/lib/data-summary.ts:141, 293, 413-417`: Aggregates tasks completed by `optimalTimeOfDay`.
  - `src/features/reviews/lib/types.ts:50`: `optimalTimeOfDay` type field.

#### 2. Behavioral Patterns & Detection Engine
- **Prisma Schema (`prisma/schema.prisma`)**:
  - Model `BehavioralPattern` (lines 828-844): Zombie model (0 read/write call sites in entire repo).
  - Model `IgnoredInsight` (lines 807-824).
  - Enums `InsightSeverity` (lines 668-673), `InsightType` (lines 675-688), `PatternType` (lines 689-697).
- **Cron Jobs & API Routes**:
  - `src/app/api/cron/insights/route.ts:1-92`: Calls `generateAllInsights()` and `generateAIInsights()`.
  - `src/app/api/cron/daily-diagnostics/route.ts:31`: Calls `/api/cron/insights`.
- **Feature Code**:
  - `src/features/insights/lib/detection.ts`: 1,120 lines of rule-based heuristics (`detectDecliningSkills`, `detectBurnoutRisk`, `detectMissedOpportunities`, `detectBudgetAnomalies`, `detectKnowledgeGaps`, `detectFocusFragmentation`, `detectAchievements`, `detectPositiveTrends`, `detectStreakMilestones`).
  - `src/features/insights/lib/ai-insights.ts`: 503 lines of behavioral LLM prompting.
  - `src/features/insights/lib/actions.ts:1-125`: Server actions for dismissing and fetching insights.
  - `src/features/insights/components/*`: `InsightCard.tsx`, `InsightFeed.tsx`, `InsightList.tsx`.
  - `src/features/dashboard/components/today-dashboard.tsx`: `InsightsCard` widget.

#### 3. Life Metrics
- **Prisma Schema (`prisma/schema.prisma`)**:
  - Model `LifeMetric` (lines 847-862).
- **Call Sites & Dependencies**:
  - `src/features/insights/lib/ai-insights.ts:135`: Queries `prisma.lifeMetric.findMany`.
  - `src/features/insights/lib/detection.ts:355`: Queries sleep `lifeMetric` for burnout risk.
  - `src/features/reviews/lib/data-summary.ts:115, 162, 304, 452-455`: Queries and formats `lifeMetrics` for reviews.
  - `src/features/reviews/lib/prompts.ts:49`: Prompts LLM to correlate mood LifeMetrics with productivity.
  - `src/features/reviews/lib/types.ts:61`: `lifeMetrics` summary types.

#### 4. Identities & Identity-First Habits
- **Prisma Schema (`prisma/schema.prisma`)**:
  - Model `Identity` (lines 510-527).
  - Enum `IdentityStatus` (lines 705-710).
  - `Routine.identityId` foreign key and relation (lines 482, 487).
- **Routes & Pages**:
  - `src/app/(app)/routines/identities/[id]/page.tsx`: Entire dynamic page route.
- **Components & Actions**:
  - `src/features/identities/` (entire directory): `IdentityCard.tsx`, `IdentityDetail.tsx`, `IdentityForm.tsx`, `IdentityGrid.tsx`, `IdentityHealthWidget.tsx`, `actions.ts`.
  - `src/features/dashboard/lib/widget-registry.ts:11, 34, 57`: `IdentityHealthWidget` registration.
  - `src/features/dashboard/components/today-dashboard.tsx:27-28, 105-106`: `IdentityHealthWidget` dynamic load.
  - `src/features/routines/components/routine-form.tsx:37, 99-114`: "Reinforces Identity" dropdown selector.
  - `src/features/routines/components/routine-list.tsx:9, 18, 191-193`: Identity tags on routine list.
  - `src/features/routines/components/routines-page-client.tsx:10-11, 20, 130, 143, 157-159`: Identity form and grid embedding.
  - `src/features/routines/lib/actions.ts:12, 17, 29, 35`: `identityId` field handlers.
  - `src/lib/sync/db.ts:107, 208`: Dexie `SyncRoutine.identityId` and index.
  - `src/lib/sync/hooks.ts:630, 646`: `useCreateRoutine` identity parameter.

---

### 4.2. Safe to Delete (Confirmed Zero Importers)

| File / Entity | Evidence |
|---|---|
| `sa_key.json` | Committed private GCP credentials; zero code imports; critical security risk. |
| `temp_migration.sql` | One-off manual SQL patch sitting loose in repo root. |
| `vercel.json` | Stale empty configuration file `{}` (app is hosted on GCP Cloud Run). |
| `reference_screenshot/` (9 images, 3MB) | Mockup PNG/JPG images never referenced by any code. |
| `src/app/proxy.ts` | Confirmed unused by `knip`. Misplaced middleware file; replace with `src/proxy.ts`. |
| `src/components/upload/DropZone.tsx` | Confirmed unused by `knip`. Superseded by `FileUploadDialog`. |
| `src/components/upload/FileUploader.tsx` | Confirmed unused by `knip`. Unused component. |
| `src/components/upload/UploadProgress.tsx`| Confirmed unused by `knip`. Unused component. |
| `src/features/dashboard/components/routines-widget.tsx` | Confirmed unused by `knip`. Replaced by `today-dashboard.tsx`. |
| `src/features/dashboard/components/todays-classes.tsx` | Confirmed unused by `knip`. Replaced by `today-dashboard.tsx`. |
| `src/features/dashboard/lib/queries.ts` | Confirmed unused by `knip`. Dashboard reads from Dexie/API routes. |
| `src/features/tasks/lib/queries.ts` | Confirmed unused by `knip`. Tasks page reads from Dexie. |
| `src/features/notes/lib/queries.ts` | Confirmed unused by `knip`. Notes page queries inline in page component. |
| `src/features/files/lib/queries.ts` | Confirmed unused by `knip`. File queries written inline. |
| `src/features/domains/lib/actions.ts` | Confirmed unused by `knip`. Domain mutations not wired to UI. |
| `src/features/insights/components/InsightFeed.tsx` | Confirmed unused by `knip`. |
| `src/features/notes/components/notes-view-toggle.tsx` | Confirmed unused by `knip`. |
| `src/lib/sync/google-calendar-sync.ts` | Confirmed unused by `knip`. Google Calendar sync handled by route. |
| `scripts/generate-icons.js` | Uses missing `sharp` package; never invoked in build or runtime. |

### 4.3. Needs Decision (Owner Input Required)

| File / Feature | Current State & Impact | Decision Options |
|---|---|---|
| `src/features/notes/components/UploadDialog.tsx` vs `src/features/notes/components/DocumentUploadDialog.tsx` vs `src/features/files/components/FileUploadDialog.tsx` | 3 distinct upload dialogs doing nearly the same thing with subtle UI differences. | Consolidate into 1 universal mobile bottom-sheet upload dialog and delete the other 2. |
| `src/features/tasks/components/TaskForm.tsx` vs `src/features/tasks/components/task-form.tsx` | Two task form components. One is used in FAB, one in Task edit dialog. | Unify into single form component. |
| `src/features/calendar/components/calendar-view.tsx` vs `mobile-calendar-view.tsx` | 1,932 lines of code across two components with a circular dependency. | Merge into a single responsive view or isolate shared primitives. |
| Full offline Dexie sync for `courses`, `routines`, `events` | Dexie sync adds massive client complexity (600+ lines in `hooks.ts`), dual-write paths, and data wipe risks. | **Recommended**: Keep Dexie only for Tasks and Notes; use Server Actions with optimistic UI for everything else. |
| `tesseract.js` OCR engine in Quick Add FAB | Weighs ~15MB in bundle, slow on phones, high Cloud Run memory usage. | Keep client-side OCR, move OCR to cloud vision API, or remove photo OCR from Quick Add. |

---

## 5. Recommended Target Architecture

### 5.1. Target Notifications & Briefs Architecture

```
                  ┌──────────────────────────────────────────────┐
                  │           Google Cloud Scheduler             │
                  └──────┬────────────────────────────────┬──────┘
                         │ 07:00 Local (01:15 UTC)        │ 20:00 Local (14:15 UTC)
                         ▼                                ▼
              ┌─────────────────────┐          ┌─────────────────────┐
              │  /api/briefs/morning│          │  /api/briefs/evening│
              └──────────┬──────────┘          └──────────┬──────────┘
                         │                                │
                         ▼                                ▼
       ┌──────────────────────────────────────────────────────────────────┐
       │             Canonical Brief & Notification Engine                │
       │  1. Check User Quiet Hours & Timezone (Asia/Kathmandu)           │
       │  2. Compute Day Context (Classes, Overdue, Habits, Tomorrow)     │
       │  3. Persist In-App Notification Record (db.inAppNotification)    │
       │  4. Deduplicate: check sent_notifications by tag (hash)          │
       │  5. Deliver Web Push via web-push (VAPID) to ALL user endpoints │
       │  6. On 404/410: delete stale push_subscriptions immediately      │
       └──────────────────────────────────────────────────────────────────┘
```

1. **One Canonical Path Per Event**:
   - Class alerts (Start / End) run on a single 5-minute scheduler job hitting `/api/notifications/scheduler`.
   - Morning Brief (Classes today, high-priority tasks due, routine goals) fires at 07:00 local time via `/api/briefs/morning`.
   - Evening Brief (Attendance check reminders, classes tomorrow, incomplete tasks) fires at 20:00 local time via `/api/briefs/evening`.
2. **Deterministic Dedup Tags**:
   - `class_start:${scheduleId}:${YYYY-MM-DD}`
   - `class_end:${courseId}:${YYYY-MM-DD}`
   - `brief_morning:${userId}:${YYYY-MM-DD}`
   - `brief_evening:${userId}:${YYYY-MM-DD}`
   - `SentNotification` records MUST be written with the individual tags BEFORE push delivery, not masked by digest wrappers.
3. **Multi-Device Support**:
   - Iterate over all subscriptions for `userId`. Send to all. Clean up 404/410 subscriptions immediately.
4. **Cloud Scheduler Security**:
   - Cloud Scheduler authenticates using GCP OIDC service account tokens (`Authorization: Bearer <token>`), verified via Google Cloud auth libraries, eliminating fragile query parameter secrets.

---

### 5.2. Target Auth & Data Access Architecture

```
Incoming Request
      │
      ▼
┌───────────────┐
│ src/proxy.ts  │ ◄── Next.js 16 Proxy Convention (Correct Location)
└───────┬───────┘
        │ 1. Refreshes Supabase session from cookies
        │ 2. If unauthenticated & route is private -> Redirect to /login
        ▼
┌────────────────────────────────────────────────────────┐
│ Server Component / Server Action / Route Handler       │
│                                                        │
│ const user = await getAuthenticatedUser();             │
│ if (!user) throw new AuthError("Unauthorized");        │
│                                                        │
│ // Direct Prisma Query with Explicit User Scoping:    │
│ await prisma.course.findFirst({                        │
│   where: { id: courseId, semester: { userId } }       │
│ });                                                    │
└────────────────────────────────────────────────────────┘
```

1. **Move Proxy**: Relocate `src/app/proxy.ts` to `src/proxy.ts` so Next.js 16 executes it on all incoming requests.
2. **Purge Global Cache**: Delete `memCache.get("auth:userId", ...)` in `src/lib/auth.ts`. Replace with React `cache(async () => { ... })` which deduplicates Supabase auth calls strictly within a single HTTP request lifecycle.
3. **Kill Default User Fallback**: Throw an explicit `UnauthorizedError` if no Supabase user session exists. Remove `"default-user"` fallback across the entire repository.
4. **Enforce Ownership Verification**: Every Server Action must assert ownership:
   - Semesters: `where: { id, userId }`
   - Courses: `where: { id, semester: { userId } }`
   - Attendance: `where: { id, course: { semester: { userId } } }`
   - Schedules: `where: { id, course: { semester: { userId } } }`

---

### 5.3. Target Sync Architecture (Simplified Hybrid)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLIENT (PWA)                               │
│                                                                         │
│  [Tasks & Quick Notes]                  [All Other Modules]             │
│  - Stored in Dexie (IndexedDB)          - Direct Server Actions         │
│  - Optimistic UI updates                - React 19 useActionState       │
│  - Sync via /api/sync/tasks & /notes    - Sonner error rollback toasts  │
└───────────────────┬─────────────────────────────────┬───────────────────┘
                    │                                 │
                    ▼                                 ▼
         ┌─────────────────────┐           ┌─────────────────────┐
         │  /api/sync/v2       │           │   Server Actions    │
         │  Incremental Pull   │           │   (Prisma DB)       │
         │  Dirty Row Push     │           └─────────────────────┘
         └──────────┬──────────┘
                    │
                    ▼
         ┌─────────────────────┐
         │ PostgreSQL (Prisma) │
         └─────────────────────┘
```

1. **Prune Sync Tables**: Completely remove `attendance`, `classSchedules`, `assessments`, `courses`, and `events` from Dexie sync. They mutate infrequently and are far more reliable via direct Server Actions.
2. **Retain Sync Only for Offline Writing**: Only `tasks` and `notes` remain in Dexie for offline capture.
3. **Eliminate Table Wiping**: Completely remove `db.*.clear()` from `seedAll()`. Replace with timestamped upsert: `updatedAt > local.updatedAt`.
4. **Soft Deletions**: Add `deletedAt DateTime?` to PostgreSQL tasks and notes to propagate server deletions cleanly to Dexie.

---

### 5.4. Target File & PDF Architecture

```
Mobile Client                                Next.js Server               Cloud Storage (GCS/S3)
     │                                             │                                │
     ├───── 1. POST /api/files/presign ───────────►│                                │
     │         { fileName, contentType, size }     │ (Validates extension & size)   │
     │◄──── 2. Returns { uploadUrl, key } ─────────┤ (Generates Presigned PUT)      │
     │                                                                              │
     ├───── 3. Direct HTTP PUT uploadUrl ──────────────────────────────────────────►│
     │         (Streaming binary upload, 0 server memory used)                      │
     │◄──── 4. HTTP 200 OK ─────────────────────────────────────────────────────────┤
     │                                             │                                │
     ├───── 5. Server Action createFileAttachment ─►│                                │
     │         { key, fileName, size }             │ (Creates DB record)            │
     │◄──── 6. Updated attachment data ────────────┤                                │
```

1. **Zero-Memory Upload**: Deprecate `uploadFile(formData)`. All uploads stream directly from the phone browser to object storage via Presigned PUT URLs with CORS configured on bucket origin.
2. **Public Endpoint Resolution**: Ensure `S3_PUBLIC_ENDPOINT` points to a reachable HTTPS domain (e.g. Cloudflare R2, AWS S3, or GCS bucket), completely eliminating the private `192.168.101.10` address.
3. **Lightweight Mobile PDF Viewer**:
   - Prune `react-pdf-highlighter-extended` and `react-pdf` duplicate bundle.
   - For mobile phones: Use native browser `<iframe src="/api/files/[key]/preview">` or `<embed>` which delegates to Android/iOS hardware-accelerated PDF rendering with 0 JavaScript bundle overhead.
   - For desktop annotation: Load PDF.js worker from local `/public/pdf.worker.min.mjs`, never from external unpkg CDN.

---

### 5.5. Target Single AI Orchestrator

```
User Query / Quick Note / Voice / Brief
                   │
                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       Academic AI Orchestrator                         │
│  Model: OpenRouter (gpt-4o-mini or claude-3-5-haiku for speed & cost)   │
│                                                                        │
│  System Prompt: Structured Academic Operator                           │
│  Security: Strict XML delimiters around user notes / PDF excerpts      │
│  Validation: All outputs validated with Zod schemas                    │
└──────────────────┬─────────────────────────────────────────────────────┘
                   │ Tool Calling
         ┌─────────┴─────────┬───────────────────┬───────────────────┐
         ▼                   ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   createTask    │ │   createNote    │ │ searchKnowledge │ │ calculateSGPA   │
│   (Tool Call)   │ │   (Tool Call)   │ │  Graph (Tool)   │ │  Target (Tool)  │
└─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘
```

1. **Unify Disconnected Callers**: Replace `askQuestion`, `generateAIInsights`, `parseQuickCapture`, and review generators with a single orchestrating agent equipped with tools (`create_task`, `create_note`, `query_schedule`, `get_attendance_status`).
2. **Zod Validation on Everything**: Every completion schema must be defined in Zod and validated with `schema.safeParse()`.
3. **Injection Defense**: All untrusted text (PDF text, note content, OCR transcripts) passed to the prompt must be wrapped in `<untrusted_academic_data>` tags with explicit instructions to ignore prompt escape attempts.

---

## 6. Phased Fix Plan

### Phase 1: Security & Stability (Immediate)
- **Actions**:
  1. Revoke GCP Service Account key in `sa_key.json`, remove file from git, and configure Secret Manager.
  2. Move `src/app/proxy.ts` to `src/proxy.ts`; verify it intercepts unauthenticated requests and redirects to `/login`.
  3. Remove global `memCache.get("auth:userId")` in `src/lib/auth.ts`; use React `cache()` per request.
  4. Fix `/api/notifications/trigger` and cron routes to enforce 401 when `CRON_SECRET` is missing.
  5. Add `NODE_OPTIONS="--max-old-space-size=4096"` to `package.json` build script.
- **Done When (Phone Verification)**:
  Open an incognito browser window on your phone and navigate to `https://<domain>/today`. The app must immediately redirect you to `/login` without loading any dashboard data or throwing errors.

### Phase 2: Feature Deletion (Removal Inventory)
- **Actions**:
  1. Remove `Identity`, `LifeMetric`, `BehavioralPattern`, and `AiInsight` models from `prisma/schema.prisma`.
  2. Drop `energyRequirement`, `optimalTimeOfDay`, `sortPriority`, and `energyImpact` fields from `Task`, `Routine`, `Person`.
  3. Delete `src/features/identities/` and `src/app/(app)/routines/identities/`.
  4. Delete `src/features/insights/lib/detection.ts` and `ai-insights.ts`.
  5. Delete dead files (`temp_migration.sql`, `vercel.json`, `reference_screenshot/`, duplicate upload/task components).
  6. Run `npx prisma db push` or create a clean migration.
- **Done When (Phone Verification)**:
  Navigate to the Routines and Tasks pages on mobile. Forms should load instantly with no "Identity", "Best Time", or "Energy" fields visible, and adding a task works cleanly.

### Phase 3: Notifications & Briefs Overhaul
- **Actions**:
  1. Fix `buildDigestWindows` in `scheduler.ts` so constituent tags are recorded in `SentNotification`.
  2. Add missing `wasNotificationSent` checks to routine reminders, reviews, and tasks.
  3. Fix Nepal timezone date formatting in `getUserLocalTime` (using `Intl.DateTimeFormat` without UTC conversion).
  4. Implement Morning Brief (07:00 local) and Evening Brief (20:00 local) endpoints.
  5. Ensure push delivery targets all active subscriptions for the user and cleans up 404/410 endpoints.
- **Done When (Phone Verification)**:
  Receive a test class alert and tap "Snooze". Verify that no duplicate push notification arrives 5 minutes later on the next scheduler run.

### Phase 4: Sync & Attendance Hardening
- **Actions**:
  1. Remove `attendance`, `classSchedules`, and `assessments` from Dexie `syncManager`.
  2. Remove `db.*.clear()` from `seedAll()`; convert to non-destructive upsert.
  3. Fix `AttendanceRecord` schema: change constraint to `@@unique([classScheduleId, date])`.
  4. Implement attendance computation helper that accounts for scheduled occurrences rather than relying on manually created rows.
  5. Fix date parsing across attendance actions (`parseISO` or date string without UTC conversion).
- **Done When (Phone Verification)**:
  Mark attendance on a course from the mobile dashboard. Turn on Airplane mode, reopen app; verify attendance status remains consistent, turn off Airplane mode, and verify no sync errors occur.

### Phase 5: Storage & Mobile Polish
- **Actions**:
  1. Update `S3_PUBLIC_ENDPOINT` to public HTTPS endpoint with CORS headers.
  2. Remove memory-buffering `uploadFile` action; implement Presigned PUT URL flow in single upload component.
  3. Remove `react-pdf-highlighter-extended` and unpkg PDF worker; use native mobile PDF rendering for viewing.
  4. Fix viewport in `layout.tsx` (`viewportFit: "cover"`, remove `maximumScale: 1`).
  5. Reposition mobile FAB button cleanly above mobile navigation bar.
- **Done When (Phone Verification)**:
  Upload a 20MB PDF lecture note from your phone on cellular data. View the document instantly in the mobile viewer without memory crashes or timeouts.

---

## 7. Open Questions for Owner Decision

1. **Object Storage Provider**: The current config points to a private LAN MinIO instance (`192.168.101.10:9004`). For reliable mobile access on Cloud Run, will you configure Cloudflare R2, Google Cloud Storage, or expose MinIO via Cloudflare Tunnel with public HTTPS?
2. **Attendance Past Classes Model**: Do you want the system to automatically generate "Not Marked" records for every class on the calendar as soon as the scheduled time passes, or should attendance percentage be computed purely on-the-fly by comparing schedule occurrences against marked absences?
3. **Calendar View on Mobile**: `calendar-view.tsx` and `mobile-calendar-view.tsx` share 1,932 lines and a circular dependency. Do you prefer keeping the full 24-hour time grid on mobile, or replacing it entirely with an agenda list view + week strip (similar to Apple Calendar)?
4. **OCR Feature in Quick Add**: Tesseract.js in the client adds ~15MB of bundle size and substantial memory overhead on mobile. Should we keep photo OCR in the FAB cluster, replace it with a lightweight server/cloud vision call, or remove OCR in favor of text quick-add?
5. **AI Orchestrator Model**: For the planned single tool-calling orchestrator, which model family do you prefer to standardize on via OpenRouter (e.g. `anthropic/claude-3.5-haiku` for low latency and high tool precision, or `openai/gpt-4o-mini`)?
