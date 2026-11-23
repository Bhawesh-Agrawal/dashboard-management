# Phase 1 Implementation: Auth, Stability, Storage, and Security Changes

This document records all changes made during Phase 1 implementation according to the audit findings in `/AUDIT_REPORT.md` and the user requirements.

---

## 1. Summary of Changes

### Auth Helper & Session Resolution
- **Removed Global In-Memory User ID Cache:** Deleted the global in-process cache key `"auth:userId"` (5-minute TTL) from `src/lib/auth.ts` and eliminated the fallback to `"default-user"`. In-process memory does not survive across requests on Cloud Run with scale-to-zero.
- **Request-Scoped Session with React `cache()`:** Replaced global caching with React's request-scoped `cache()`. Each request resolves the Supabase user session once and caches it strictly for that request's lifecycle, guaranteeing no cross-request leakage across concurrent requests.
- **Typed `UnauthorizedError`:** Exported `UnauthorizedError` from `src/lib/auth.ts`. When an unauthenticated request reaches `getCurrentUserId()`, it throws `UnauthorizedError`.
- **Call-Site Handling:**
  - Route handlers (`src/app/api/...`) catch `UnauthorizedError` and return `NextResponse.json({ error: "Unauthorized" }, { status: 401 })`.
  - Server actions propagate the error directly to the caller.
  - Eliminated dead null-checks across API routes (`mark-from-push`, `notifications/snooze`, `sync/google-calendar`) that erroneously assumed `getCurrentUserId()` could return null or empty string.
  - Decoupled widget token authentication in `/api/widget/*` from Supabase session cookies. `requireWidgetAuth` validates the widget token against `prisma.widgetToken` and forwards the associated `userId`.

### Ownership Scoping & Semester Backfill
- **Strict User Scoping on Academic Features:** Server actions and queries in `semesters`, `courses`, `schedule` (classes + exceptions), `attendance`, and `assessments` now authenticate via `getCurrentUserId()` and scope queries to the owner (`semester.userId`).
  - Semesters: `createSemester` automatically sets `userId: currentUserId`. Updates, deletions, and active semester selection verify ownership before applying mutations.
  - Courses: `createCourse`, `updateCourse`, `deleteCourse`, and `updateAttendanceMode` verify that the parent semester belongs to the user.
  - Class Schedules & Exceptions: `createClassSchedule`, `updateClassSchedule`, `deleteClassSchedule`, `createScheduleException`, and `deleteScheduleException` verify ownership via relation paths (`course.semester.userId`).
  - Attendance: `markAttendance`, `bulkMarkAttendance`, and `getAttendanceSummary` verify course ownership via parent semester.
  - Assessments: `createAssessment`, `updateAssessment`, and `deleteAssessment` verify ownership through course and semester relations.
- **Interim Null-Safety Filter:** Because existing database rows have `userId: NULL` on semesters, queries currently use `{ OR: [{ userId }, { userId: null }] }` to avoid breaking existing development data prior to running the backfill script.
- **Backfill Script:** Created `scripts/backfill-semester-user.ts`.
  - Accepts the owner's Supabase User ID as a CLI argument.
  - Runs in `--dry-run` mode by default, listing all semesters with `userId: NULL`.
  - Updates rows only when `--execute` flag is passed.

### Fail-Closed Cron Authentication
- **Created `src/lib/cron-auth.ts`:** Implemented a unified `verifyCronRequest(request: Request)` verification utility that fails closed if neither authentication mechanism is configured.
- **Dual Authentication Support:**
  1. **Google Cloud Scheduler OIDC Token:** Validated via `google-auth-library` (`OAuth2Client.verifyIdToken`), verifying audience (`CRON_OIDC_AUDIENCE`) and optional service account email (`CRON_OIDC_SERVICE_ACCOUNT_EMAIL`).
  2. **Static Bearer Token:** Constant-time comparison using `crypto.timingSafeEqual` against `CRON_BEARER_TOKEN` (or `CRON_SECRET`), enabling external webhooks (such as home server n8n workflows) to trigger jobs without Google IAM.
- **Removed `?secret=` Query Handling:** Completely eliminated URL query string authentication across all cron endpoints (`/api/cron/daily-diagnostics`, `/api/cron/insights`, `/api/cron/knowledge-gaps`, `/api/cron/reviews`) and the notification trigger endpoint (`/api/notifications/trigger`).
- **Updated `cloudbuild.yaml`:** Configured Cloud Scheduler trigger jobs to pass authentication via `Authorization: Bearer` headers instead of query parameters.

### Proxy Relocation (Next.js 16)
- **Moved Proxy to `src/proxy.ts`:** In Next.js 16, Middleware is named Proxy and must reside at `src/proxy.ts` (or the project root). The existing file at `src/app/proxy.ts` was dead code and was never executed by the Next.js runtime.
- **Route Exclusions:** Configured `config.matcher` and internal path guards in `src/proxy.ts` to strictly exclude:
  - `/api/cron/*`
  - `/api/notifications/trigger`
  - `/api/widget/*`
  - `/sw.js`
  - `/manifest.json`, `/manifest.webmanifest`, `/site.webmanifest`
  - `/icons/*`
  - `/offline.html` and `/offline`
  - `_next/static/*`, `_next/image/*`, `favicon.ico`, and static media files (`svg`, `png`, `jpg`, `webp`, etc.).
- **Unauthenticated Redirects vs. API 401s:**
  - Page routes: Unauthenticated browser requests redirect to `/login`.
  - API routes: Unauthenticated requests return `401 Unauthorized` JSON instead of HTML redirects.
  - Authenticated visits to `/login` or `/signup` automatically redirect to `/today`.

### Storage Overhaul & MinIO Configuration
- **S3 Client Hardening (`src/lib/s3/client.ts`):** Removed the hardcoded LAN IP default (`http://192.168.101.10:9004`). In production, the client throws a fatal startup error if `S3_PUBLIC_ENDPOINT` is not defined.
- **Memory-Buffering Action Deleted:** Removed `uploadFile` from `src/lib/s3/actions.ts`. Cloud Run scale-to-zero instances must never buffer file uploads in Node memory.
- **Presigned PUT with 90 MB Limit:** All uploads use direct browser-to-MinIO presigned PUT URLs via `getPresignedUploadUrl`. Enforced a strict 90 MB maximum file size both client-side and server-side.
- **Graceful Storage-Offline UI:** In `PdfViewerModal.tsx` and `FileViewerModal.tsx`, replaced blank screens on connection errors with a clear user notice: `"Files unavailable, storage is offline"` and a retry action.
- **Keep Offline PWA Feature:** Added `src/lib/pdf/offline-cache.ts` and updated `public/sw.js` with `pinned-documents-v1` cache support. Users can store critical pinned documents (tickets, lecture notes) for offline viewing directly from the viewer.
- **Documentation (`infra/minio.md`):** Documented MinIO CORS policies, Cloudflare Tunnel configuration, `MINIO_SERVER_URL` settings, and an automated nightly backup n8n workflow.

### Secrets Hygiene
- Removed `sa_key.json` (Google Service Account key) from the git working tree and staging index.
- Added `sa_key.json`, `.env`, `.env.local`, `.env.production`, and `.env*.local` to `.gitignore`.

### Test Suite & Mocking
- **Mocked Prisma in Traversal Tests:** Rewrote `src/features/knowledge-graph/lib/__tests__/traversal.test.ts` using Vitest `vi.mock("@/lib/prisma")` and `vi.mock("@/lib/auth")`. Tests now execute in-memory with zero reliance on a live PostgreSQL instance.
- **Auth Unit Tests (`src/lib/__tests__/auth.test.ts`):** Verified that `getCurrentUserId()` throws `UnauthorizedError` when no session is present, returns the user ID when authenticated, and maintains isolation between requests.
- **Ownership Unit Tests:** Added `src/features/attendance/lib/__tests__/ownership.test.ts` and `src/features/semesters/lib/__tests__/ownership.test.ts` verifying ownership scoping on academic actions.
- Total Vitest tests: 17 passed across 4 test suites (100% pass rate).

---

## 2. Required Pre-Deployment Step

> [!IMPORTANT]
> **Database Backfill Required Before Enabling Strict Production Filters**
> Existing semesters in the production database have `userId: NULL`. 
> Before switching from the interim `{ OR: [{ userId }, { userId: null }] }` filter to strict `{ userId }` scoping in production, execute the backfill script with the owner's Supabase User ID:
>
> ```bash
> # 1. Preview changes (Dry run):
> npx tsx scripts/backfill-semester-user.ts <OWNER_SUPABASE_USER_ID>
>
> # 2. Apply updates:
> npx tsx scripts/backfill-semester-user.ts <OWNER_SUPABASE_USER_ID> --execute
> ```

---

## 3. Secret-Looking Strings Inventory

The following files contain references to credentials, secrets, or private keys:
- `.github/workflows/deploy.yml` (references secret `GCP_SA_KEY`)
- `cloudbuild.yaml` (references GCP Secret Manager secrets: `DATABASE_URL`, `DIRECT_URL`, `OPENROUTER_API_KEY`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`, `S3_SECRET_ACCESS_KEY`)
- `src/features/calendar/lib/google-calendar.ts` (references `process.env.GOOGLE_CALENDAR_CLIENT_SECRET`)
- `src/features/notifications/lib/scheduler.ts` (references `process.env.VAPID_PRIVATE_KEY`)
- `src/lib/cron-auth.ts` (references `process.env.CRON_BEARER_TOKEN` and `process.env.CRON_SECRET`)
- `src/lib/s3/client.ts` (references `process.env.S3_SECRET_ACCESS_KEY`)
- `infra/minio.md` (documentation placeholders)

*(All actual secret values are loaded strictly from environment variables or Secret Manager and are not checked into source control).*

---

## 4. Unverified Items & Testing Limitations

The following items could not be verified in this sandbox environment and require live infrastructure testing:
1. **Google Cloud Scheduler Live OIDC Validation:** The `OAuth2Client.verifyIdToken` logic was validated via static analysis and unit testing, but live token verification with Google's public certs requires live Cloud Scheduler execution against Cloud Run.
2. **MinIO Cloudflare Tunnel HTTPS Reachability:** Because network access to self-hosted MinIO is unavailable from the local sandbox, live presigned PUT uploads and MinIO CORS preflight requests must be tested against the live Cloudflare Tunnel endpoint.
3. **Web Push Background Receipt on iOS:** Mobile PWA push delivery depends on Safari APNs integration and Apple device token registration, which requires an active device installation.
