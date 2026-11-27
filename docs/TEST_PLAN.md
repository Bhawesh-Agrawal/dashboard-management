# Phase 4 Notification & Brief Test Plan

## Prerequisites

Set `CRON_SECRET` in `.env.local` and start the local dev server (`npm run dev`). All `/api/notifications/trigger` requests require `Authorization: Bearer <CRON_SECRET>`.

Note: `asOf` and `only` query parameters are **non-production only** and return `400 Bad Request` when `DEPLOY_ENV=production` or `NODE_ENV=production` (without local override).

## Curl Commands for Every Notification Type

Replace `2026-11-25` with a date where you have scheduled items, using UTC timestamps corresponding to `Asia/Kathmandu` (`UTC+05:45`):

### 1. Class Start Reminder (`class_start`, default 10 min before)
Example for a 10:00 NPT class (09:52 NPT = `2026-11-25T04:07:00.000Z`):
```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/notifications/trigger?asOf=2026-11-25T04:07:00.000Z&only=class_start"
```

### 2. Attendance Prompt (`class_end`, after class ends)
Example for a class ending at 11:00 NPT (11:05 NPT = `2026-11-25T05:20:00.000Z`):
```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/notifications/trigger?asOf=2026-11-25T05:20:00.000Z&only=class_end"
```

### 3. Task Reminder (`task_due`, tasks with explicit non-midnight due time)
Example for a task due at 14:00 NPT (13:50 NPT = `2026-11-25T08:05:00.000Z`):
```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/notifications/trigger?asOf=2026-11-25T08:05:00.000Z&only=task_due"
```

### 4. Calendar Event Reminder (`calendar_event`, default 15 min before)
Example for an event at 16:00 NPT (15:50 NPT = `2026-11-25T10:05:00.000Z`):
```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/notifications/trigger?asOf=2026-11-25T10:05:00.000Z&only=calendar_event"
```

### 5. Morning Brief (`morning_brief`, default 07:00 NPT = `01:15Z`, 3-hour grace window)
```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/notifications/trigger?asOf=2026-11-25T01:20:00.000Z&only=morning_brief"
```

### 6. Evening Brief (`evening_brief`, default 20:30 NPT = `14:45Z`, 3-hour grace window)
```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/notifications/trigger?asOf=2026-11-25T14:50:00.000Z&only=evening_brief"
```

## Duplicate-Prevention Check

Run the exact same `curl` command twice in a row. The second response should report `"sent": 0` and `"skippedDedup": 1`.

---

## Brief v2 (`morning_brief`, `midday_brief`, `evening_brief`) Verification

Use `asOf` (non-production) and `only` against `/api/notifications/trigger` to verify each brief variant and dedup:

```bash
# 1. Morning brief (07:00 Asia/Kathmandu = 01:15 UTC)
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/notifications/trigger?asOf=2026-11-27T01:15:00.000Z&only=morning_brief"

# 2. Midday brief (13:00 Asia/Kathmandu = 07:15 UTC; requires midday_brief enabled in Settings)
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/notifications/trigger?asOf=2026-11-27T07:15:00.000Z&only=midday_brief"

# 3. Evening brief (20:30 Asia/Kathmandu = 14:45 UTC)
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/notifications/trigger?asOf=2026-11-27T14:45:00.000Z&only=evening_brief"
```

Re-running any of the commands above for the same local date must return `"sent": 0` and `"skippedDedup": 1`.


---

## Phase 7b: Academic Calendar Display & Importer Phone Checklist

1. **Main `/calendar` on phone & desktop:**
   - Open `/calendar` in Month view and verify markers (`Holiday`, `Exams`, `Follows Mon`) and muted backgrounds on cancelled dates:
     - **19 Dec 2026**: `Follows Mon` marker; tapping day shows `"Saturday, follows Monday timetable"` and all-day item `"Follows Monday timetable"`.
     - **25 Dec 2026**: `Holiday` marker; muted cell background; detail sheet shows `"Holiday: Christmas"`, `"Classes cancelled"`, and `"Edit in academic calendar"` link.
     - **26 Jan 2027**: `Holiday` marker; `"Holiday: Republic Day"`.
     - **28 Jan – 4 Feb 2027**: `Exams` marker on each day; detail/agenda shows `"Exam period: Mid-Semester Examinations, day 1 of 8"` through `"day 8 of 8"`.
     - **1 Apr – 8 Apr 2027**: `Exams` marker on each day; `"Exam period: End-Semester Examinations, day 1 of 8"` through `"day 8 of 8"`.
   - Toggle `"Show academic calendar"` off and back on; reload the page and confirm preference persists.
   - Switch between Month, Week, and Day views on both mobile and desktop.
2. **`/today` via simulated clock:**
   - Set simulated clock to **2027-01-26** (Republic Day): verify `/today` top card reads `"Today: holiday, Republic Day. No classes."`.
   - Set simulated clock to **2026-12-19**: verify `/today` top card reads `"Today follows the Monday timetable."`.
   - Set simulated clock to **2027-01-27** (day before Mid-Sem): verify `"Tomorrow: Mid-Semester Examinations begin."`.
   - When semester is upcoming, verify `"N days to the first class on <date>."` appears.
3. **Importer & Audit on `/semesters/[id]/calendar`:**
   - Paste the 24 calendar lines + 18 key-date lines; confirm exact dates, stripped bracket tags, `"Saturday follows Monday timetable"` titles, and `"These entries cancel classes on N weekdays."` impact preview.
   - Click `"Audit entries"` on existing data and verify suggestions apply only on tap.


---

## Phase 8 Item 5: Mobile PDF Viewer Checklist

1. Open a pinned 50–100+ page PDF in `/notes` on mobile (`360x800` / `390x844`) while offline:
   - Confirm the viewer opens using `/pdfjs/pdf.worker.min.mjs` (no `unpkg.com` requests in DevTools Network).
   - Confirm only nearby pages render while distant pages show lightweight placeholders, and scrolling remains smooth without memory crashes.
   - Test pinch-to-zoom, double-tap zoom (`1x ↔ 1.75x`), and the page jump bar (`Page X of Y` + `Go`).
   - Close and reopen the PDF and verify it resumes at the last viewed page.
   - Verify annotation/highlight toolbars are hidden on mobile and present on desktop (`>= 1024px`).
   - Trigger a load failure (e.g. invalid URL) and verify `"Can't open this file"` renders with **Retry** and **Open in browser**.


### Phase 8: Phone Shell & Reliability Checklist

1. **Bottom Navigation & Safe Areas (360x800 / 390x844)**
   - Verify bottom navigation shows **Today, Tasks, Calendar, Notes, More** with `44px+` touch targets.
   - Verify **Ask** is accessible under **More** (`/ask`) and via the floating action cluster.
   - Open the PDF viewer, note editor, and setup wizard; verify the bottom navigation hides during fullscreen flows and reappears on exit.
   - Scroll to the bottom of any page and verify content clears the fixed bottom nav + iPhone home indicator (`safe-area-inset-bottom`).
2. **One Unified Calendar**
   - On mobile (`<1024px`), open `/calendar` and verify the week strip + day agenda renders with zero horizontal overflow.
   - Tap the month button to open the Month overview bottom sheet, tap a day, and verify the day agenda updates.
   - Tap `+` to open event creation as a bottom sheet; verify keyboard focus keeps the active input visible.
3. **Mobile PDF Viewer & Uploads**
   - Open a course PDF on mobile; verify lazy `±2` page window rendering, pinch-to-zoom, double-tap zoom, jump-to-page, and remembered last page on reopen.
   - Turn on Airplane Mode on a pinned PDF and verify it opens cleanly from Cache Storage without network.
   - When MinIO/S3 is offline, verify `/api/health/storage` returns offline and the document library shows `"Files are unavailable: storage offline"`.
4. **Sync Visibility, Errors & PWA**
   - Edit a task offline, verify the mobile header sync pill shows pending dirty count; tap it to open the Sync status bottom sheet, reconnect, and tap **Sync now**.
   - Visit a non-existent route (`/does-not-exist`) and verify the custom `NotFound` state renders with a **Back to Today** link.
   - Install the PWA on Android/iOS and verify launcher shortcuts (**Today**, **Daily Brief**, **Quick Capture**, **DSA Log**) and the `/offline.html` fallback.
