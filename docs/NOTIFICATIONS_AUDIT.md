# Notifications Audit & Map

Generated from the codebase prior to Phase 4 refactoring. Every finding cites exact `file:line` locations.

## 1. Entry Points & Infrastructure

| Component | Path | Role |
| :--- | :--- | :--- |
| Cron / Trigger Route | `src/app/api/notifications/trigger/route.ts:15-60` | Authenticated via `verifyCronRequest` (`src/lib/cron-auth.ts`). Accepts `?asOf=` (non-prod only, via `withSimulatedTime`) and `?force=true`. Calls `runNotificationScheduler(force)`. |
| Scheduler Engine | `src/features/notifications/lib/scheduler.ts:1452-1585` | Iterates distinct `userId`s from `push_subscriptions`, runs 13 generators, batches via `buildDigestWindows`, sends via `sendPushNotifications`, writes `SentNotification`, and prunes entries >7 days old. |
| Daily Diagnostics Cron | `src/app/api/cron/daily-diagnostics/route.ts:29-117` | Runs at 02:00 `Asia/Kathmandu`. Generates weekly/monthly/quarterly `Review` rows and deletes `SentNotification` rows older than 7 days (`L95-99`). Does not send pushes. |
| Push Subscriptions | `src/features/notifications/lib/subscription.ts:10-70` | Server actions `subscribeToPush`, `unsubscribeFromPush`, `getActiveSubscriptions`. |
| Snooze / Open Tracking | `src/app/api/notifications/snooze/route.ts:6-48`, `src/app/api/notifications/mark-opened/route.ts:12-36` | Updates `SentNotification.snoozedUntil` and `SentNotification.openedAt` from service worker `notificationclick` events. |
| Service Worker | `public/sw.js:184-325` | Displays incoming Web Push (`push` event) and handles `notificationclick` (`snooze`, `mark_present`, `mark_absent`, URL navigation). |
| Digest Page | `src/app/(app)/notifications/digest/page.tsx:36-108` | Displays grouped notification types from `?types=...` when `buildDigestWindows` batches >1 notification. |
| Notification Settings UI | `src/features/notifications/components/notification-settings.tsx`, `notification-type-toggles.tsx`, `daily-summary-settings.tsx` | Manages Web Push subscription, per-type toggles, quiet hours, and `daily_summary` time/sections/timezone. |

## 2. Event Type -> Fire Paths Table

| Event Type (`NotificationType`) | Generator / Fire Path | Status | Dedup Check in Generator? | Dedup Tag / Key |
| :--- | :--- | :--- | :--- | :--- |
| `class_start` | `generateClassNotifications` (`scheduler.ts:431-517`) | Live | Yes (`wasNotificationSent` + `isNotificationSnoozed`, `L487-490`) | `class-${schedule.id}-${todayStr}` |
| `class_end` | `generateClassEndNotifications` (`scheduler.ts:523-624`) | Live | Yes (`wasNotificationSent` + `isNotificationSnoozed`, `L577-580`) | `attendance-${schedule.id}-${todayStr}` |
| `class_cancelled` | `generateClassCancellationNotifications` (`scheduler.ts:630-690`) | Live | Yes (`wasNotificationSent`, `L665`) | `cancelled-${exception.id}-${todayStr}` |
| `class_rescheduled` | `generateClassRescheduleNotifications` (`scheduler.ts:691-758`) | Live | Yes (`wasNotificationSent`, `L726`) | `rescheduled-${exception.id}-${todayStr}` |
| `routine_reminder` | `generateRoutineReminders` (`scheduler.ts:285-331`) | Live (buggy) | **No** | `routine-${routine.id}` (no date!) |
| `task_due` | `generateTaskNotifications` (`scheduler.ts:337-425`) | Live (buggy) | **No** | `tasks-due-today`, `tasks-due-tomorrow` |
| `assessment` | `generateAssessmentNotifications` (`scheduler.ts:759-808`) | Live (buggy) | **No** | `assessment-${...}` |
| `missed_routine` | `generateMissedRoutineNotifications` (`scheduler.ts:809-909`) | Live (buggy) | **No** | `missed-routine-...` |
| `overdue_task` | `generateOverdueTaskNotifications` (`scheduler.ts:910-1005`) | Live (buggy) | **No** | `overdue-tasks-...` |
| `daily_summary` | `generateDailySummary` (`scheduler.ts:1006-1269`) | Live (buggy) | **No** | `daily-summary-...` |
| `review_daily` | `generateDailyReviewAlert` (`scheduler.ts:1349-1372`) | Live (buggy, no generator creates `daily` reviews) | **No** | `review-daily` |
| `review_weekly` | `generateWeeklyReviewAlert` (`scheduler.ts:1379-1409`) | Live (buggy) | **No** | `review-weekly` |
| `review_monthly` | `generateMonthlyReviewAlert` (`scheduler.ts:1416-1446`) | Live (buggy) | **No** | `review-monthly` |

## 3. Root Causes of Duplicate Pushes & Missed Deliveries (Confirmed with `file:line`)

1. **Digest marks only the digest tag, never the underlying items (CONFIRMED)**
   - `scheduler.ts:1646`: `buildDigestWindows` replaces `n.tag` with `digest-${userId}-${window[0].tag}`.
   - `scheduler.ts:1574-1576`: `runNotificationScheduler` calls `markNotificationSent(n.userId, n.tag, n.data.type)` on the digested output.
   - Result: None of the individual item tags (e.g., `class-<id>-<date>` or `attendance-<id>-<date>`) are recorded in `SentNotification`. On the next 5-minute tick, those items are still within their trigger window and fire again.

2. **Nine generators lack `wasNotificationSent` checks (CONFIRMED)**
   - `grep -n "wasNotificationSent" src/features/notifications/lib/scheduler.ts` shows checks ONLY in `class_start` (`L487`), `class_end` (`L577`), `class_cancelled` (`L665`), and `class_rescheduled` (`L726`).
   - `routine_reminder` (`L285`), `task_due` (`L337`), `assessment` (`L759`), `missed_routine` (`L809`), `overdue_task` (`L910`), `daily_summary` (`L1006`), `review_daily` (`L1349`), `review_weekly` (`L1379`), and `review_monthly` (`L1416`) never check `SentNotification` before returning payloads. Any multi-tick overlap in `isWithinTimeWindow` re-sends them.

3. **Missing `await` on `isTypeEnabled` disables preference filtering (CONFIRMED)**
   - `scheduler.ts:1486`: `if (!isTypeEnabled(userId, type)) return false;`
   - `isTypeEnabled` is `async` (`L106`), so `!Promise` is always `false`. User opt-outs in `NotificationPreference.enabled = false` are ignored and all 13 generators run.

4. **Single-subscription cap drops multi-device pushes (CONFIRMED)**
   - `scheduler.ts:1301-1307`: `sendPushNotifications` keeps only `latestSubByUser` (most recent `createdAt`), silently dropping other registered devices (e.g., phone vs. laptop).

5. **Timezone / Date mismatch between `localDateOnly` and `.toISOString()`**
   - `scheduler.ts:483` & `L557`: `const todayStr = userLocalTime.toISOString().split("T")[0];`
   - `getUserLocalTime` (`L226-259`) constructs a `Date` in the server's local timezone using wall-clock parts from `Intl.DateTimeFormat`. Calling `.toISOString()` converts it back to UTC, shifting the date backward during early morning hours in `Asia/Kathmandu` (UTC+5:45), diverging from `localDateOnly(userLocalTime)` (`L10-15`).
   - `generateTaskNotifications` (`L346-375`) uses `getNow()` and `.toDateString()` instead of `userLocalTime`.

6. **Subscription `upsert` bug in `subscribeToPush`**
   - `subscription.ts:20-24`: `where: { id: subscription.endpoint.slice(-36) }` looks up by `id` (which is a random UUID on `create`), so re-subscribing the same browser endpoint creates duplicate `PushSubscription` rows instead of updating.

## 4. Existing Mechanisms Reference

- **Dedup storage**: `SentNotification` (`prisma/schema.prisma:575-589`) has `@@unique([userId, tag])`, `sentAt`, `openedAt`, `snoozedUntil`.
- **Quiet hours**: `isWithinQuietHours` (`scheduler.ts:121-141`) supports midnight-wrapping windows (default `22:00`–`07:00`), bypassed for `priority === "critical"` (`L1490`).
- **404/410 cleanup**: `sendPushNotifications` (`scheduler.ts:1329-1337`) deletes `pushSubscription` rows matching `sub.endpoint` when `web-push` throws `statusCode === 404 || 410`.
- **VAPID setup**: Uses `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_EMAIL` (`scheduler.ts:1283-1296`).
- **Tick behaviour**: Cloud Scheduler hits `GET /api/notifications/trigger` periodically (every 5 minutes); `runNotificationScheduler` evaluates all 13 generators for every user with a push subscription, batches via `buildDigestWindows`, dispatches via `web-push`, records `SentNotification`, and deletes `SentNotification` rows older than 7 days.

## 5. Test Coverage Map

| Scenario | Test File | Test Name |
| :--- | :--- | :--- |
| Each of the 6 types fires once at right local time & never twice across 12 consecutive 5-min ticks | `src/features/notifications/lib/__tests__/engine-clock.test.ts` | `fires each of the 6 types once and never twice across 12 consecutive 5-minute ticks, and skips disabled types` |
| Quiet hours suppression for non-critical notifications | `src/features/notifications/lib/__tests__/engine-clock.test.ts` | `respects quiet hours for non-critical notifications` |
| Brief configured inside quiet hours deferred to `quietHoursEnd` | `src/features/notifications/lib/__tests__/brief-scheduling.test.ts` | `defers a brief configured inside quiet hours until quietHoursEnd and delivers once` |
| Subscription removed on 404/410 | `src/features/notifications/lib/__tests__/engine-clock.test.ts` | `removes a dead subscription on 404 or 410 and delivers to remaining subscription` |
| Two devices (phone + laptop) each get one push | `src/features/notifications/lib/__tests__/engine-clock.test.ts` | `fires class_start once across 12 consecutive 5-minute ticks and delivers to both phone and laptop` |
| Ended semester sends no class reminders or attendance prompts | `src/features/notifications/lib/__tests__/semester-lifecycle.test.ts` & `engine-clock.test.ts` | `ended semester produces NO class reminders and NO attendance prompts under simulated asOf clock` / `stays silent for ended semesters, skips cancelled classes, and skips already-marked attendance` |
| Cancelled class sends nothing | `src/features/notifications/lib/__tests__/engine-clock.test.ts` | `stays silent for ended semesters, skips cancelled classes, and skips already-marked attendance` |
| Attendance prompt skipped when already marked | `src/features/notifications/lib/__tests__/engine-clock.test.ts` | `stays silent for ended semesters, skips cancelled classes, and skips already-marked attendance` |
| Brief generated late within 3h grace window and not after | `src/features/notifications/lib/__tests__/brief-scheduling.test.ts` | `recovers from a missed first tick within the 3-hour grace window, and skips after 3 hours` |
| Brief after timezone change fires once per local day | `src/features/notifications/lib/__tests__/brief-scheduling.test.ts` | `respects timezone changes` |
| Disabled type never sends | `src/features/notifications/lib/__tests__/engine-clock.test.ts` | `fires each of the 6 types once and never twice across 12 consecutive 5-minute ticks, and skips disabled types` |
| Semester gap day produces briefs without class sections | `src/features/briefs/lib/__tests__/build.test.ts` | `skips empty sections and omits classes when semester is ended` |
| Concurrent dispatch dedup race, all-fail claim release, partial-success claim keep | `src/features/notifications/lib/__tests__/engine.test.ts` | `handles two concurrent dispatches...`, `releases the claim when every subscription send fails...`, `keeps the claim on partial success...` |

## 6. Task & Calendar Event Trigger Specification

### `task_due`
- **Eligible tasks:** `Task` rows where `userId = <user>`, `status = "open"`, and `dueDate IS NOT NULL`.
- **Explicit time required:** `dueDate` in the user's configured timezone (`getLocalTimeParts(dueDate, tz)`) must have a non-midnight time (`hour !== 0 || minute !== 0`). Date-only tasks (stored at local `00:00`) never trigger `task_due` pushes; they appear in the Morning Brief instead.
- **Lead time:** Fires on the local due date when `0 <= dueLocal.totalMinutes - local.totalMinutes <= 15` (15-minute window before due time).
- **Dedup key:** `task_due:${task.id}:${YYYY-MM-DD}`.

### `calendar_event`
- **Eligible events:** `Event` rows where `userId = <user>` and `dateTime` falls on `todayDateOnly` in the user's timezone.
- **Lead time:** Configurable via `NotificationPreference(type="calendar_event").reminderMinutes` (default **15 minutes**). Fires when `0 <= eventLocal.totalMinutes - local.totalMinutes <= minutesBefore`.
- **Dedup key:** `calendar_event:${event.id}:${YYYY-MM-DD}`.
