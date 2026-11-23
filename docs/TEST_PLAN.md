# Comprehensive Manual Test Plan

This document provides a feature-by-feature verification checklist for manual quality assurance before and after releases. Each test case specifies the exact steps, expected results, and compatible testing environments (`Local`, `Tunnel-on-phone`, or `GCP only`).

---

## Summary Matrix

| # | Feature Checklist Item | Local | Tunnel-on-Phone | GCP Only |
|---|------------------------|:-----:|:---------------:|:--------:|
| 1 | Auth Redirect & Protection | ✅ | ✅ | ✅ |
| 2 | Fail-Closed Cron Bearer Auth | ✅ | ✅ | ✅ |
| 3 | Attendance Marking & Scoping | ✅ | ✅ | ✅ |
| 4 | PDF Open in Document Viewer | ✅ | ✅ | ✅ |
| 5 | Storage Upload under 90MB (Presigned PUT) | ✅ | ✅ | ✅ |
| 6 | Storage Upload over 90MB Rejection | ✅ | ✅ | ✅ |
| 7 | Offline Pinned PDF in Airplane Mode | ⚠️ (DevTools) | ✅ | ✅ |
| 8 | Web Push Notification Receipt | ❌ (Needs HTTPS) | ✅ | ✅ |
| 9 | Notification Deduplication (`SentNotification`) | ✅ | ✅ | ✅ |

---

## Detailed Test Cases

### 1. Auth Redirect & Route Protection

- **Goal**: Ensure unauthenticated requests to protected pages redirect to `/login`, while static assets and proxy-excluded endpoints (cron, widget, sw.js) pass through without redirection.
- **Environment**: `Local` / `Tunnel-on-phone` / `GCP only`
- **Steps**:
  1. Open a clean browser incognito / private window.
  2. Navigate directly to `http://localhost:3000/courses` (or your staging URL).
  3. Observe browser URL and rendered page.
  4. Now test an excluded static path by requesting `http://localhost:3000/sw.js` and `http://localhost:3000/manifest.json`.
- **Expected Result**:
  - The browser is immediately redirected to `/login?returnUrl=%2Fcourses` (HTTP 307).
  - The excluded static files (`/sw.js`, `/manifest.json`, `/offline`, `/_next/*`) return HTTP 200 without redirection.
  - After completing login, user is redirected back to `/courses`.

---

### 2. Fail-Closed Cron Authentication (Bearer Token & OIDC)

- **Goal**: Verify that `/api/notifications/trigger` and `/api/cron/*` reject requests without credentials or with invalid secrets, and accept valid Bearer tokens.
- **Environment**: `Local` / `Tunnel-on-phone` / `GCP only`
- **Steps**:
  1. **Unauthenticated request**:
     ```bash
     curl -i http://localhost:3000/api/notifications/trigger
     ```
  2. **Query string secret attempt (deprecated legacy parameter)**:
     ```bash
     curl -i "http://localhost:3000/api/notifications/trigger?secret=dev-local-cron-bearer-token-12345"
     ```
  3. **Invalid Bearer token**:
     ```bash
     curl -i -H "Authorization: Bearer wrong-token" http://localhost:3000/api/notifications/trigger
     ```
  4. **Valid Bearer token (constant-time check)**:
     ```bash
     curl -i -H "Authorization: Bearer dev-local-cron-bearer-token-12345" http://localhost:3000/api/notifications/trigger
     ```
- **Expected Result**:
  - Steps 1, 2, and 3 must return HTTP 401 Unauthorized with `{"error":"Unauthorized"}`.
  - Step 4 returns HTTP 200 OK with `{"ok":true,"timestamp":"..."}`.

---

### 3. Attendance Marking & Ownership Scoping

- **Goal**: Verify attendance can be marked for valid courses owned by the user, and that cross-user tampering is rejected.
- **Environment**: `Local` / `Tunnel-on-phone` / `GCP only`
- **Steps**:
  1. Log in as User A.
  2. Navigate to a course page: `/courses/<course-id>`.
  3. In the Attendance section, click an attendance cell to cycle status: `not_marked` -> `present` -> `absent` -> `cancelled`.
  4. Verify the attendance percentage updates immediately on UI and persists upon full page reload.
  5. Attempt to mark attendance for a course belonging to another user using the server action or push endpoint:
     ```bash
     curl -i -X POST http://localhost:3000/api/attendance/mark-from-push \
       -H "Content-Type: application/json" \
       -H "Cookie: <User-A-Session-Cookie>" \
       -d '{"courseId":"user-b-course-id","date":"2026-11-23","status":"present"}'
     ```
- **Expected Result**:
  - Valid attendance state changes save to Postgres and update UI percentage.
  - Unauthorized course modification returns HTTP 403 Forbidden (`Course not found or unauthorized`).

---

### 4. PDF Open in Document Viewer

- **Goal**: Verify that attached syllabus, exam, or note PDFs render smoothly in the modal viewer.
- **Environment**: `Local` / `Tunnel-on-phone` / `GCP only`
- **Steps**:
  1. Navigate to a course notes page or document view with an existing PDF attachment.
  2. Click on the document title or "View PDF" button to open the PDF viewer modal.
  3. Check page navigation (next/prev page), zoom in/out, and text selection.
  4. Test storage-down scenario: stop local MinIO container (`docker stop minio-dev`), refresh the page, and attempt to view the document.
- **Expected Result**:
  - PDF renders cleanly with responsive canvas scaling.
  - When storage is down or unreachable, the viewer displays a graceful message: *"Files unavailable, storage is offline"* rather than crashing or showing an infinite white screen.

---

### 5. Storage Upload Under 90MB (Presigned PUT Flow)

- **Goal**: Verify end-to-end file upload using direct client-to-storage presigned PUT URLs with visible upload progress.
- **Environment**: `Local` / `Tunnel-on-phone` / `GCP only`
- **Steps**:
  1. Create or obtain a test PDF file of size ~10MB to 50MB (e.g. `head -c 25M </dev/urandom > test-25mb.pdf`).
  2. In the course or note upload interface, select `test-25mb.pdf`.
  3. Observe upload progress bar in the UI.
  4. Check network tab: verify the browser issues a `POST /api/storage/presign` (or server action) to get a signed URL, followed by an HTTP `PUT` directly to MinIO (`S3_PUBLIC_ENDPOINT`).
- **Expected Result**:
  - Presigned URL is generated without memory buffering on the Next.js server.
  - Upload progress increases smoothly from 0% to 100%.
  - On upload completion, the file metadata is saved, and the document is immediately viewable.

---

### 6. Storage Upload Over 90MB Rejection

- **Goal**: Verify that files exceeding the 90MB limit are rejected both client-side and server-side.
- **Environment**: `Local` / `Tunnel-on-phone` / `GCP only`
- **Steps**:
  1. Create a dummy file of 95MB:
     ```bash
     head -c 95M </dev/urandom > test-95mb.pdf
     ```
  2. Attempt to select this file via the upload file picker.
  3. **Client-side check**: Observe immediate toast/error message before any network transmission.
  4. **Server-side check**: Bypass client-side UI and call the presign endpoint directly:
     ```bash
     curl -i -X POST http://localhost:3000/api/storage/presign \
       -H "Content-Type: application/json" \
       -H "Cookie: <Session-Cookie>" \
       -d '{"filename":"large.pdf","size":99614720,"contentType":"application/pdf"}'
     ```
- **Expected Result**:
  - Client file picker shows: *"File exceeds maximum allowed size of 90MB"*.
  - Server endpoint rejects the request with HTTP 400 Bad Request and error: *"File size exceeds 90MB limit"*.

---

### 7. Offline Pinned PDF in Airplane Mode

- **Goal**: Verify that pinned documents are stored in the Service Worker Cache (`pwa-documents-cache`) and remain readable with network connectivity disabled.
- **Environment**: `Tunnel-on-phone` (Physical Device) or `Local` (Chrome DevTools Network: Offline)
- **Steps**:
  1. Open the app on your mobile browser (via Cloudflare tunnel HTTPS).
  2. Open a syllabus or note PDF.
  3. Toggle the **"Keep Offline"** (Pin) switch.
  4. Wait for the confirmation toast: *"Document cached for offline access"*.
  5. Put the phone into **Airplane Mode** (or select "Offline" in Chrome DevTools).
  6. Reload the page or navigate to the pinned document.
- **Expected Result**:
  - Pinned PDF opens and renders completely offline from CacheStorage.
  - Unpinned documents display the offline fallback message.

---

### 8. Web Push Notification Receipt

- **Goal**: Verify that the browser registers the service worker, requests push subscription, and displays system notification banners.
- **Environment**: `Tunnel-on-phone` or `GCP only` (Requires secure HTTPS origin)
- **Steps**:
  1. Open the app on a physical phone via HTTPS tunnel.
  2. Navigate to Settings -> Notifications.
  3. Enable Push Notifications and approve the browser prompt.
  4. Note the user ID from your session.
  5. Trigger a test notification via simulated scheduler call:
     ```bash
     curl -i -X GET "https://<tunnel-url>/api/notifications/trigger?force=true" \
       -H "Authorization: Bearer <CRON_BEARER_TOKEN>"
     ```
- **Expected Result**:
  - Push subscription endpoint and keys are saved to `PushSubscription` table.
  - A system push notification banner appears on the device with title, body, and action buttons.
  - Tapping notification opens the app to the relevant URL.

---

### 9. Notification Deduplication (`SentNotification`)

- **Goal**: Verify that recurring or re-run crons do not produce duplicate push notifications for the same event or quiet-hours window.
- **Environment**: `Local` / `Tunnel-on-phone` / `GCP only`
- **Steps**:
  1. Trigger notifications twice consecutively with valid Bearer token:
     ```bash
     curl -s -H "Authorization: Bearer dev-local-cron-bearer-token-12345" http://localhost:3000/api/notifications/trigger
     curl -s -H "Authorization: Bearer dev-local-cron-bearer-token-12345" http://localhost:3000/api/notifications/trigger
     ```
  2. Check the `SentNotification` table:
     ```bash
     DEPLOY_ENV=local npx prisma studio
     ```
     Inspect entries in `SentNotification`.
- **Expected Result**:
  - The first trigger generates the notification and writes a record with `userId_tag` to `SentNotification`.
  - The second trigger recognizes the existing tag and suppresses sending a duplicate notification.

---

## Staging Revision Only (Live Infrastructure Verification)

The following tests require deployment to the tagged staging Cloud Run revision (`gcloud run deploy --no-traffic --tag staging`) or external mobile/tunnel infrastructure.

### 10. Google Cloud Scheduler Live OIDC Validation
- **Goal**: Verify that Google Cloud Scheduler generates authentic OIDC identity tokens and that Cloud Run validates them with Google's public signing keys via `OAuth2Client.verifyIdToken`.
- **Environment**: `GCP only` (Cloud Run staging revision)
- **Steps**:
  1. Deploy the staging revision with tag: `gcloud run deploy dashboard-management --image=<IMAGE> --no-traffic --tag staging`.
  2. Note the staging URL: `https://staging---dashboard-management-xxxx-el.a.run.app`.
  3. Trigger the Cloud Scheduler job manually using the gcloud CLI:
     ```bash
     gcloud scheduler jobs run notifications --location=asia-south1
     ```
  4. Inspect the Cloud Run service logs:
     ```bash
     gcloud logging read 'resource.type="cloud_run_revision" AND textPayload=~"Cron request authenticated"' --limit=10 --format="table(timestamp, textPayload)"
     ```
- **Expected Result**:
  - The request succeeds with HTTP 200 OK.
  - Logs show OIDC verification successful with the designated service account email (`_SCHEDULER_SA`) and audience matching the service URL.
  - Any request with forged or unsigned tokens is rejected with HTTP 401 Unauthorized.

### 11. MinIO Cloudflare Tunnel HTTPS Reachability
- **Goal**: Verify browser-to-MinIO direct presigned PUT uploads over the public Cloudflare Tunnel without mixed-content or CORS blocks.
- **Environment**: `Tunnel-on-phone` or `GCP only`
- **Steps**:
  1. Ensure Cloudflare Tunnel is running and forwarding to MinIO public endpoint (e.g., `https://s3.yourdomain.com`).
  2. Log into the app on a mobile device or desktop browser using the staging URL.
  3. Upload a sample document (e.g. syllabus or assignment PDF).
  4. Inspect browser DevTools Network tab:
     - Verify preflight `OPTIONS` request to `https://s3.yourdomain.com/<bucket>/...` returns HTTP 200 with headers `Access-Control-Allow-Origin: *` (or the specific app domain) and `Access-Control-Allow-Methods: GET, PUT, POST, DELETE`.
     - Verify subsequent `PUT` request transmits the binary payload and returns HTTP 200 OK.
  5. Open the uploaded document in the viewer to confirm successful retrieval and presigned GET signature.
- **Expected Result**:
  - Upload completes smoothly without CORS or SSL handshake errors.
  - Document is persisted in MinIO bucket and accessible via presigned GET URL.

### 12. Web Push Background Receipt on iOS
- **Goal**: Verify web push notification delivery on iOS Safari PWA (iOS 16.4+) when the web application is backgrounded or device is locked.
- **Environment**: `Tunnel-on-phone` (Physical iOS device running iOS 16.4+)
- **Steps**:
  1. Open the staging HTTPS URL in Safari on an iPhone running iOS 16.4+.
  2. Tap the Share button -> "Add to Home Screen" to install the PWA.
  3. Open the installed PWA from the Home Screen.
  4. Log in and navigate to Settings -> Notifications. Tap "Enable Push Notifications" and allow permissions.
  5. Swipe up to background the PWA and lock the phone screen.
  6. From a terminal, invoke the notification trigger endpoint:
     ```bash
     curl -s -H "Authorization: Bearer <CRON_BEARER_TOKEN>" "https://staging---dashboard-management-xxxx-el.a.run.app/api/notifications/trigger"
     ```
- **Expected Result**:
  - Device vibrates/rings and displays a system push notification banner on the lock screen.
  - Tapping the notification awakens the PWA and routes to the relevant notification URL.
