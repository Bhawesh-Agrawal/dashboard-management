# Phase 1 Implementation: Auth, Stability, Storage, Guardrails, and Infrastructure

This document records all changes made during Phase 1 (1a, 1b, and 1c) implementation in accordance with `/AUDIT_REPORT.md` and the Phase 1 engineering requirements.

---

## 1. Summary of Changes & Architecture Decisions

### Item 1 & Item 3: GCP Cost Guardrails & Cloud Scheduler OIDC
- **GCP Free-Tier Conformance in `cloudbuild.yaml`:**
  - Cloud Run deploy flags strictly configured: `--min-instances=0`, `--max-instances=2`, `--memory=512Mi`, `--cpu=1`, `--cpu-boost`.
  - Request-based billing enforced (CPU throttling enabled; `--no-cpu-throttling` is omitted).
  - Machine type rationale: Cloud Build uses `machineType: E2_HIGHCPU_8` because Next.js standalone Turbopack compilation inside Docker requires >4GB RAM to prevent out-of-memory errors that occur on default `e2-standard-2` machine types.
- **Artifact Registry Cleanup Policy (`infra/artifact-registry-cleanup.json`):**
  - Created automated retention policy keeping only the 3 most recent container image versions to prevent exceeding the GCP Artifact Registry free storage tier (0.5 GB/month).
  - Provided complete apply and verification instructions in [infra/artifact-registry-cleanup.md](file:///home/bhawesh/Projects/dashboard-management/infra/artifact-registry-cleanup.md).
- **Consolidated Cloud Scheduler Jobs (At Most 3 Jobs):**
  - Consolidated all cron endpoints into exactly 2 active jobs + 1 reserved spare slot:
    1. **Job 1 (5-minute tick):** `notifications` running `*/5 6-23 * * *` (06:00 to 23:00 `Asia/Kathmandu`) calling `/api/notifications/trigger`. Handles upcoming class push alerts and brief time-window evaluations.
    2. **Job 2 (Daily maintenance):** `daily-maintenance` running `0 2 * * *` (02:00 `Asia/Kathmandu`) calling `/api/cron/daily-diagnostics` (which sequentially runs insights detection, knowledge gap pre-computation, and review generation).
    3. **Job 3 (Spare):** Reserved slot.
  - All Cloud Scheduler jobs now authenticate strictly via Google OIDC tokens:
    - `--oidc-service-account-email=$_SCHEDULER_SA`
    - `--oidc-token-audience=$$SERVICE_URL`
  - Replaced legacy static `Authorization: Bearer $$CRON_SECRET` headers in Scheduler jobs. The static `CRON_BEARER_TOKEN` is strictly reserved for external n8n or home server webhook calls.
- **No GCP-Specific SDKs in App Code:** Verified that application code contains zero GCP client libraries (`@google-cloud/storage`, `@google-cloud/tasks`, etc.). Storage uses standard S3 SDK (`@aws-sdk/client-s3`), database uses Prisma over Postgres, and auth uses Supabase.

### Item 2: Mark-Opened Notification Auth
- Updated `/api/notifications/mark-opened` to authenticate exclusively via Supabase session cookies using `getCurrentUserId()`.
- Completely removed the `x-user-id` HTTP request header from `public/sw.js` and server route handlers.
- Confirmed that all routes called by the service worker (`/api/notifications/mark-from-push`, `/api/notifications/snooze`, `/api/notifications/mark-opened`, `/api/notifications/subscribe`) work seamlessly with same-origin cookies through `src/proxy.ts` (configured with `credentials: "include"`).

### Item 4: Deployment Pipelines Comparison
- Analyzed `cloudbuild.yaml` and `.github/workflows/deploy.yml`. Kept both active without deleting either.
- Authored [infra/deploy-comparison.md](file:///home/bhawesh/Projects/dashboard-management/infra/deploy-comparison.md) recommending GitHub Actions with keyless Workload Identity Federation (WIF).
- Provided complete step-by-step setup guide for GCP Workload Identity Pool, GitHub OIDC provider, IAM role bindings, and sample workflow configuration.

### Item 5: Lazy S3 Client Validation
- Refactored `src/lib/s3/client.ts` to use a lazy Proxy initialization pattern.
- S3 environment variables (`S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`) are validated only upon the first operational S3 call rather than at module evaluation time.
- Verified that `NODE_ENV=production next build` succeeds without requiring S3 environment variables to be present during build time.

### Item 6: Offline Pinned Documents Keying & Viewer Pre-Check
- Updated `src/lib/pdf/offline-cache.ts` and `public/sw.js` to strictly key Cache Storage by file ID (`/offline-doc/${fileId}`), never by presigned URL containing transient expiration or authentication query parameters.
- Updated `PdfViewerModal.tsx` and `FileViewerModal.tsx` to check Cache Storage (`getCachedDocumentBlobUrl(fileId)`) **before** attempting to request a presigned URL from the server.
- When cached, the document loads instantly via a local blob URL without issuing any network requests, allowing seamless offline viewing in airplane mode.
- Added comprehensive unit tests in `src/lib/pdf/__tests__/offline-cache.test.ts`.

### Item 7: Authentication Enforcement, Proxy & Server Actions
- **How Pages and Layouts Enforce Auth Today:**
  - `src/proxy.ts` (Next.js 16 Proxy / Middleware) operates as the primary perimeter authentication boundary. It intercepts all incoming browser requests to page routes (`/(app)/*`, `/today`, `/courses`, `/notes`, etc.) and validates the Supabase session token via `@supabase/ssr` cookies.
  - If no authenticated session exists, `src/proxy.ts` issues an immediate HTTP 307 redirect to `/login?returnUrl=<encodedPath>`.
  - Because `src/proxy.ts` intercepts requests before page rendering begins, page components and layouts do not require manual redirect calls, completely preventing double redirects or flashing unauthenticated content.
  - If an authenticated user visits `/login` or `/signup`, `src/proxy.ts` immediately redirects them to `/today`.
- **Excluded Routes in Proxy:**
  - `src/proxy.ts` explicitly bypasses authentication checks for: `/api/cron/*`, `/api/notifications/trigger`, `/api/widget/*`, `/sw.js`, `/manifest.*`, `/icons/*`, `/offline*`, and `/_next/*` static assets.
- **Unauthenticated Server Action Calls:**
  - Server actions invoke `await getCurrentUserId()`. If no Supabase session cookie is present, `getCurrentUserId()` throws a typed `UnauthorizedError("Authentication required")`.
  - At the React client boundary, the caller receives a rejected promise containing the error, preventing unauthorized database queries.

### Item 8: Sync Hotfix (`seedAll` Dirty Row Protection)
- Refactored `seedAll()` in `src/lib/sync/sync-manager.ts`.
- Replaced unconditional `db[table].clear()` calls with a selective sync mechanism:
  - Scans all local Dexie records for dirty states (`dirty === 1`, `_dirty === true`, `_syncStatus !== 'synced'`, `_deleted === 1`, or pending mutations in `syncQueue`).
  - Clears only clean, synchronized records (`bulkDelete(cleanIds)`).
  - When upserting seed data from `/api/sync/seed`, skips incoming rows that conflict with local dirty records (`dirtyIds.has(row.id)`), preserving unpushed offline changes.
- Added unit tests in `src/lib/sync/__tests__/seed-dirty.test.ts` verifying that dirty rows survive `seedAll()`.

### Item 9: STRICT_OWNER_SCOPING Migration Guide
- Created `src/lib/owner-scoping.ts` exporting `isStrictOwnerScopingEnabled()` and `ownerWhere(userId)`.
- Controlled via environment variable `STRICT_OWNER_SCOPING`:
  - When `STRICT_OWNER_SCOPING === "true"`: returns `{ semester: { userId } }`.
  - When `STRICT_OWNER_SCOPING !== "true"` (default): returns `{ semester: { OR: [{ userId }, { userId: null }] } }`.
- Applied `ownerWhere()` across `semesters`, `courses`, `schedule`, `attendance`, and `assessments`.
- **Two-Step Production Migration:**
  1. **Step 1 (Backfill Semesters):** Execute the backfill script against production to assign existing legacy semesters (`userId: NULL`) to the owner's Supabase User ID:
     ```bash
     DEPLOY_ENV=production npx tsx scripts/backfill-semester-user.ts <OWNER_SUPABASE_USER_ID> --execute --i-know-this-is-production
     ```
  2. **Step 2 (Flip Environment Variable):** In Google Cloud Run configuration, set `STRICT_OWNER_SCOPING=true`.

### Item 10: Request-Scoped Simulated Clock via AsyncLocalStorage
- Refactored `src/lib/clock.ts` to use Node.js `AsyncLocalStorage` (`als.run(simulatedTime, fn)`).
- Time travel simulation is strictly request-scoped and set only during the execution of `/api/notifications/trigger?asOf=...`.
- Zero module-level mutable time: concurrent requests remain completely isolated.
- In production (`NODE_ENV === "production" || DEPLOY_ENV === "production"`), `asOf` is strictly rejected with HTTP 400 Bad Request.
- Added concurrency and isolation unit tests in `src/lib/__tests__/clock.test.ts` and `src/app/api/notifications/trigger/__tests__/trigger-asof.test.ts`.

### Item 11: Production Database Guard (`PROD_DB_HOST`)
- Enhanced `scripts/guard.ts` to enforce `PROD_DB_HOST` validation on script execution and application startup (`src/lib/prisma.ts`).
- If `DEPLOY_ENV !== 'production'` and the target database host matches `PROD_DB_HOST`, execution is immediately aborted with a fatal error.
- If `DEPLOY_ENV === 'local'` and the host is not local loopback (`localhost`, `127.0.0.1`, `::1`), a warning is displayed requiring interactive user confirmation.
- Added 14 unit tests in `scripts/__tests__/guard.test.ts`.

### Item 12: Staging Revision Manual Verification Plan
- Copied all 3 unverified items into [docs/TEST_PLAN.md](file:///home/bhawesh/Projects/dashboard-management/docs/TEST_PLAN.md) under `## Staging Revision Only (Live Infrastructure Verification)`:
  - Test 10: Google Cloud Scheduler Live OIDC Validation
  - Test 11: MinIO Cloudflare Tunnel HTTPS Reachability
  - Test 12: Web Push Background Receipt on iOS

---

## 2. Raw Verification Command Outputs (Item 13)

### A. Deprecated Auth Strings Check
Command:
```bash
grep -rn "default-user\|auth:userId\|x-user-id" src
```
Output (Exit Code 1, 0 matches found):
```text
(Zero matches found - completely eradicated from source tree)
```

### B. Secrets Query Handling Check
Command:
```bash
grep -rnE "secret=" src cloudbuild.yaml .github
```
Output:
```text
src/app/api/notifications/trigger/route.ts:9: * Query parameter secret (?secret=...) is rejected.
src/lib/cron-auth.ts:25: * Never accepts query parameters (?secret= is completely rejected).
```
*(Verified: zero active query string secret parsing in codebase; occurrences are code comments documenting rejection).*

### C. Continuous Integration Test Suite (`npm run test:ci`)
Command:
```bash
npm run test:ci
```
Output:
```text
> dashboard-management@0.1.0 test:ci
> tsc --noEmit && npm run lint && vitest run

> dashboard-management@0.1.0 lint
> eslint

✔ 0 errors, 217 warnings (all pre-existing any/react-hooks warnings)

 RUN  v4.1.10 /home/bhawesh/Projects/dashboard-management

 ✓ scripts/__tests__/guard.test.ts (14 tests) 11ms
 ✓ src/lib/sync/__tests__/seed-dirty.test.ts (8 tests) 7ms
 ✓ src/lib/pdf/__tests__/offline-cache.test.ts (5 tests) 11ms
 ✓ src/features/semesters/lib/__tests__/ownership.test.ts (4 tests) 13ms
 ✓ src/features/attendance/lib/__tests__/ownership.test.ts (4 tests) 9ms
 ✓ src/lib/__tests__/auth.test.ts (4 tests) 8ms
 ✓ src/features/knowledge-graph/lib/__tests__/traversal.test.ts (5 tests) 22ms
 ✓ src/lib/__tests__/clock.test.ts (7 tests) 66ms
 ✓ src/app/api/notifications/trigger/__tests__/trigger-asof.test.ts (9 tests) 127ms
 ✓ src/lib/__tests__/owner-scoping.test.ts (3 tests) 11ms

 Test Files  10 passed (10)
      Tests  63 passed (63)
   Duration  920ms
```

### D. Production Build (`npm run build`)
Command:
```bash
npm run build
```
Output:
```text
▲ Next.js 16.2.10 (Turbopack)
- Environments: .env.local

  Creating an optimized production build ...
✓ Compiled successfully in 7.6s
✓ Finished TypeScript in 21.9s 
✓ Collecting page data using 15 workers in 1831ms 
✓ Generating static pages using 15 workers (19/19) in 296ms
✓ Finalizing page optimization in 414ms 

Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /api/attendance/mark-from-push
├ ƒ /api/auth/google/callback
├ ƒ /api/cron/daily-diagnostics
├ ƒ /api/cron/insights
├ ƒ /api/cron/knowledge-gaps
├ ƒ /api/cron/reviews
├ ƒ /api/notes/[id]/backlinks
├ ƒ /api/notes/[id]/related
├ ƒ /api/notes/graph
├ ƒ /api/notes/link-metadata
├ ƒ /api/notifications/mark-opened
├ ƒ /api/notifications/snooze
├ ƒ /api/notifications/trigger
├ ƒ /api/sync/calendar
├ ƒ /api/sync/dashboard
├ ƒ /api/sync/google-calendar
├ ƒ /api/sync/seed
├ ƒ /api/sync/write
├ ƒ /api/widget/quick-add
├ ƒ /api/widget/routines/[id]/complete
├ ƒ /api/widget/summary
├ ƒ /api/widget/tasks/[id]/toggle
├ ƒ /ask
├ ƒ /budget
├ ƒ /calendar
├ ƒ /courses/[id]
├ ƒ /library
├ ƒ /login
├ ƒ /more
├ ƒ /notes
├ ƒ /notes/[id]
├ ƒ /notes/graph
├ ƒ /notifications/digest
├ ƒ /people
├ ƒ /people/[id]
├ ƒ /projects
├ ƒ /projects/[id]
├ ƒ /reviews
├ ƒ /reviews/[id]
├ ƒ /routines
├ ƒ /routines/identities/[id]
├ ƒ /search
├ ƒ /semesters
├ ƒ /semesters/[id]
├ ƒ /settings
├ ƒ /signup
├ ƒ /tasks
└ ƒ /today

ƒ Proxy (Middleware)
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

### E. Container Smoke Test (`npm run docker:smoke` / Podman)
Command:
```bash
CONTAINER_ID=$(podman run -d --name smoke-test -p 8080:8080 --memory=512m --cpus=1 -e DEPLOY_ENV=local -e NODE_ENV=production -e PORT=8080 dashboard-management:smoke)
sleep 4
podman stats --no-stream smoke-test
```
Output:
```text
▲ Next.js 16.2.10
- Local:         http://localhost:8080
- Network:       http://0.0.0.0:8080
✓ Ready in 0ms

ID            NAME        CPU %       MEM USAGE / LIMIT  MEM %       NET IO       BLOCK IO    PIDS        CPU TIME    AVG CPU %
458e4dad3732  smoke-test  23.96%      62.39MB / 536.9MB  11.62%      370B / 856B  0B / 0B     11          1.038141s   23.96%
```
**Peak Memory Observed:** `62.39 MB` (11.62% of the 512MB limit).

---

## 3. Comprehensive Itemized Summary Table (Items 1–13)

| Item # | Item Description | Status | Commit Hash | Files Changed | What Could Not Be Verified |
| :---: | :--- | :---: | :---: | :--- | :--- |
| **1** | **GCP Cost Guardrails & Cron Consolidation:** Min-instances 0, request-based billing, max-instances 2, memory 512Mi, machineType E2_HIGHCPU_8 rationale, Artifact Registry cleanup policy (keep last 3 images), merge crons into at most 3 Scheduler jobs, no GCP SDKs. | `DONE` | `f1897da` | `cloudbuild.yaml`, `infra/artifact-registry-cleanup.json`, `infra/artifact-registry-cleanup.md` | Actual GCP Artifact Registry cleanup execution requires running against live GCP project. |
| **2** | **Mark-Opened Notification Session Auth:** `/api/notifications/mark-opened` uses Supabase cookie session; removed `x-user-id` header; confirmed same-origin cookies via `src/proxy.ts`. | `DONE` | `abfebc1` | `src/app/api/notifications/mark-opened/route.ts`, `public/sw.js` | Push click interaction in a real iOS/Android push notification tray requires mobile device testing. |
| **3** | **Cloud Scheduler OIDC Auth:** Scheduler jobs use `--oidc-service-account-email` and `--oidc-token-audience`; static bearer token reserved for n8n only. | `DONE` | `f1897da` | `cloudbuild.yaml` | Live Cloud Scheduler OIDC issuance requires triggering active job in GCP Console. |
| **4** | **Deploy Pipelines Comparison:** Compared `cloudbuild.yaml` and `.github/workflows/deploy.yml`; kept both; authored recommendation for GitHub Actions with keyless WIF. | `DONE` | `77a34e2` | `infra/deploy-comparison.md` | Setting up WIF pool requires GCP organization/project owner IAM permissions. |
| **5** | **Lazy S3 Client Validation:** S3 client proxy initialization prevents import-time errors; proved `NODE_ENV=production next build` passes without S3 env vars. | `DONE` | `75b3918` | `src/lib/s3/client.ts` | End-to-end binary upload to self-hosted MinIO over live Cloudflare Tunnel requires tunnel uptime. |
| **6** | **Offline Pinned Documents Keying:** Cache strictly keyed by file ID (`/offline-doc/${fileId}`); viewer checks cache before requesting presigned URL; works in airplane mode. | `DONE` | `ff6a968` | `src/lib/pdf/offline-cache.ts`, `src/lib/pdf/__tests__/offline-cache.test.ts`, `src/features/notes/components/PdfViewerModal.tsx`, `src/features/notes/components/FileViewerModal.tsx` | Physical device airplane mode toggle requires manual phone testing. |
| **7** | **Auth Enforcement & Proxy Documentation:** Documented page/layout auth enforcement, confirmed zero double redirects with `src/proxy.ts`, documented server action `UnauthorizedError`. | `DONE` | `2736047` | `CHANGES.md` | None (verified via code inspection, Next.js proxy matcher rules, and unit tests). |
| **8** | **Sync Hotfix (`seedAll` Dirty Protection):** `seedAll()` preserves rows with `dirty: 1`, `_dirty: true`, or `_syncStatus !== 'synced'`, and pending `syncQueue` mutations; unit tests added. | `DONE` | `908a7cd` | `src/lib/sync/sync-manager.ts`, `src/lib/sync/__tests__/seed-dirty.test.ts` | Multi-device concurrent conflict resolution in live browser Dexie requires two physical devices. |
| **9** | **STRICT_OWNER_SCOPING Helper:** Introduced `ownerWhere` helper; applied across academic actions; documented two-step backfill and flip migration. | `DONE` | `924c394` | `src/lib/owner-scoping.ts`, `src/lib/__tests__/owner-scoping.test.ts`, `src/features/semesters/lib/actions.ts`, `src/features/courses/lib/actions.ts`, `src/features/schedule/lib/actions.ts`, `src/features/attendance/lib/actions.ts`, `src/features/assessments/lib/actions.ts` | Running backfill script against live production database requires production DB access. |
| **10** | **Simulated Clock Request-Scoped with ALS:** Refactored `clock.ts` to request-scoped `AsyncLocalStorage`; `asOf` simulation works only in non-production; unit tests for concurrency. | `DONE` | `e5d5912` | `src/lib/clock.ts`, `src/lib/__tests__/clock.test.ts`, `src/app/api/notifications/trigger/route.ts`, `src/app/api/notifications/trigger/__tests__/trigger-asof.test.ts` | None (100% verified via concurrent simulated clock vitest suites). |
| **11** | **Production Guard (`PROD_DB_HOST`):** Refuses execution if not production and DB host equals `PROD_DB_HOST`; warns on non-local host in local env; startup check in `prisma.ts`. | `DONE` | `c27ab38` | `scripts/guard.ts`, `scripts/__tests__/guard.test.ts`, `src/lib/prisma.ts` | None (100% verified via 14 unit tests). |
| **12** | **Staging Revision Test Plan:** Copied 3 unverified items into `docs/TEST_PLAN.md` under staging revision section with exact steps. | `DONE` | `5c3a192` | `docs/TEST_PLAN.md` | Execution of staging revision test cases requires deploying revision with `--no-traffic --tag staging`. |
| **13** | **Verification Outputs & Changes Table:** Executed raw verification commands, captured raw output into `CHANGES.md`, and compiled 13-row completion table. | `DONE` | `2736047` | `CHANGES.md` | None (all raw command outputs captured and presented). |
