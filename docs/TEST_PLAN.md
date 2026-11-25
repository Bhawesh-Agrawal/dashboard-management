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
