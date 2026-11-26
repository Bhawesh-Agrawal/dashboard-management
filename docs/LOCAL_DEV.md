# Local Development & Notification Scheduler

## Why Notifications Require a Running Ticker

In production, Google Cloud Scheduler hits `/api/notifications/trigger` every 5 minutes.
**Without a running scheduler locally, no scheduled push notifications or briefs ever fire** because Next.js does not run background cron jobs on its own.

## Running the Local Dev Ticker

1. Ensure `.env.local` defines `CRON_SECRET` (and optionally `NEXT_PUBLIC_APP_URL`, defaulting to `http://localhost:3000`).
2. Start the Next.js dev server (`npm run dev`).
3. In a second terminal, run:

```bash
npm run dev:tick
```

`scripts/dev-tick.ts`:
- Refuses to run when `NODE_ENV=production`.
- Calls `GET /api/notifications/trigger` with `Authorization: Bearer $CRON_SECRET` every 5 minutes.
- Prints one summary line per tick (`sent`, `skipped`, `errors`) and stops after 3 consecutive failures.
- Supports optional passthrough flags:

```bash
npm run dev:tick -- --asOf=2026-11-25T01:20:00.000Z --only=morning_brief
```

## Account Signup (`ALLOW_SIGNUP`)

`/signup` and the `signup` server action are disabled by default (`ALLOW_SIGNUP` unset or not `"true"`). To allow creating a local account during development, set `ALLOW_SIGNUP=true` in `.env.local`.
