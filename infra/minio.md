# MinIO & Storage Architecture

This document specifies the storage configuration for CodexDash, utilizing self-hosted MinIO behind a Cloudflare Tunnel on HTTPS (`S3_PUBLIC_ENDPOINT`), CORS policies for direct browser-to-storage presigned uploads, and nightly automated backups via n8n.

---

## 1. Network & Endpoint Architecture

The application runs on Cloud Run (scale-to-zero) and must never buffer large uploads in Node.js server memory. All file uploads and downloads use direct presigned URLs:

1. **Client** requests a presigned PUT URL from Next.js server (`getPresignedUploadUrl`).
2. **Client** uploads the file directly to MinIO via HTTPS `PUT`.
3. **MinIO** is hosted on the home server and exposed to the public internet exclusively via **Cloudflare Tunnel** (`cloudflared`).

### MinIO Server Configuration

In your MinIO `.env` or systemd service on the host machine:

```bash
# S3 API listen address (local)
MINIO_ADDRESS=":9000"

# MinIO Console listen address
MINIO_CONSOLE_ADDRESS=":9001"

# CRITICAL: External URL for signature calculation and presigned URLs.
# Without this, MinIO generates presigned URLs with internal LAN IPs or wrong hosts.
MINIO_SERVER_URL="https://storage.yourdomain.com"

# External URL for the MinIO web console (optional)
MINIO_BROWSER_REDIRECT_URL="https://minio-admin.yourdomain.com"
```

### Application Environment Variables (Cloud Run)

In production, `S3_PUBLIC_ENDPOINT` is mandatory (the app fails loudly at startup if missing):

```bash
S3_ENDPOINT="https://storage.yourdomain.com"
S3_PUBLIC_ENDPOINT="https://storage.yourdomain.com"
S3_REGION="us-east-1"
S3_BUCKET="dashboard"
S3_FORCE_PATH_STYLE="true"
S3_ACCESS_KEY_ID="<your-minio-access-key>"
S3_SECRET_ACCESS_KEY="<your-minio-secret-key>"
```

---

## 2. MinIO Bucket & CORS Configuration

Direct browser uploads (`fetch` / `XMLHttpRequest` with `PUT`) from the web app origin to `https://storage.yourdomain.com` trigger browser CORS preflight checks (`OPTIONS`). MinIO must be configured with a CORS policy on the `dashboard` bucket.

### Setting CORS via MinIO Client (`mc`)

1. Install and configure `mc` on your host or workstation:
   ```bash
   mc alias set myminio https://storage.yourdomain.com ACCESS_KEY SECRET_KEY
   ```

2. Create a CORS configuration file `cors.json`:
   ```json
   {
     "CORSRules": [
       {
         "AllowedOrigins": [
           "https://app.yourdomain.com",
           "https://yourdomain.com",
           "http://localhost:3000"
         ],
         "AllowedMethods": [
           "GET",
           "PUT",
           "HEAD",
           "DELETE"
         ],
         "AllowedHeaders": [
           "*"
         ],
         "ExposeHeaders": [
           "ETag",
           "Content-Length",
           "Content-Type",
           "Last-Modified"
         ],
         "MaxAgeSeconds": 3600
       }
     ]
   }
   ```

3. Apply the CORS policy to the bucket:
   ```bash
   mc cors set myminio/dashboard cors.json
   ```

4. Verify the CORS policy:
   ```bash
   mc cors get myminio/dashboard
   ```

---

## 3. Upload Size Limit (90 MB)

- **Cloudflare Tunnel Request Limit:** Cloudflare's standard HTTP body limit on proxied connections is 100 MB.
- **Application Limit:** Both client-side and server-side enforce a strict limit of **90 MB** (`MAX_FILE_SIZE = 90 * 1024 * 1024`).
- Any attempt to upload a file exceeding 90 MB is rejected before network transfer begins with a clear error: `"File exceeds maximum size of 90 MB"`.

---

## 4. Offline Document Caching (PWA)

For pinned documents (notes, tickets, routine attachments), the app uses the Cache Storage API (`pinned-documents-v1`) supported by the Service Worker:
- Users can click **"Keep Offline"** in the document viewer.
- The PDF is stored in `caches.open("pinned-documents-v1")`.
- When storage is unreachable or the phone is offline, the viewer loads directly from the local cache with an "Offline copy" badge.

---

## 5. Nightly Automated Backup Workflow (n8n)

An automated n8n workflow runs nightly on the home server to backup all MinIO objects to an offsite destination (e.g. Backblaze B2, Google Drive, or secondary cold storage).

### Workflow Architecture

```
[Cron Trigger: 0 2 * * *]
          ↓
[MinIO / S3 Node: List Bucket Objects (prefix: "")]
          ↓
[Filter / Split In Batches: 50 items]
          ↓
[S3 Node: Get Object Stream]
          ↓
[Secondary Storage: Put Object (B2 / Cloud Storage / NAS)]
          ↓
[If Error → Send Discord/Telegram Alert]
          ↓
[On Complete → Log Backup Summary & Metrics]
```

### Node Specifications

1. **Schedule Trigger**:
   - Cron Expression: `0 2 * * *` (Daily at 02:00 AM local time).
2. **AWS S3 / MinIO Node (List Objects)**:
   - Resource: `Bucket`
   - Operation: `List`
   - Bucket: `dashboard`
3. **Batch Loop**:
   - Batch size: `25`
   - Streams files directly between S3 and target storage without saving full files to local disk.
4. **Target Destination**:
   - Secondary bucket or encrypted tarball on separate volume.
5. **Notification**:
   - In case of failure or network timeout: sends webhook notification to Discord/Telegram with the failed file key and error message.
