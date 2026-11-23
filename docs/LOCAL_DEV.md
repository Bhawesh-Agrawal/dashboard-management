# Local Development Guide

This guide documents the complete step-by-step procedure to run and test the application locally in an environment that faithfully mirrors the production Cloud Run and GCP architecture.

---

## 1. Prerequisites

- **Node.js**: v22.x LTS (`node -v`)
- **Docker**: For running local MinIO, local Supabase (optional), and container smoke tests (`docker -v`)
- **PostgreSQL Client**: `psql` and `pg_restore` (`psql --version`)
- **Cloudflare Tunnel CLI**: `cloudflared` (optional, for testing PWA and push on physical phones)

---

## 2. Supabase Setup (Database & Auth)

You have two options for the database and authentication backend:

### Option A: Local Supabase CLI Stack (Recommended for offline work)

1. Initialize and start the Supabase local stack:
   ```bash
   npx supabase init
   npx supabase start
   ```
2. The CLI outputs local service credentials:
   - **API URL**: `http://127.0.0.1:54321`
   - **DB URL**: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
   - **Studio URL**: `http://127.0.0.1:54323`
   - **anon key**: Copy to `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - **service_role key**: Copy to `SUPABASE_SERVICE_ROLE_KEY`

### Option B: Dedicated Cloud Dev Project

Create a free development project in the [Supabase Dashboard](https://supabase.com). Copy the Project URL, anon key, and pooled/direct connection strings.

---

## 3. Restoring Production Data (pg_dump)

To test migrations or realistic data locally, restore a sanitized production database dump:

1. Obtain a dump from production (e.g. `prod_backup.dump` or `prod_backup.sql`).
2. Restore into your local development database:
   ```bash
   # For custom/archive format (.dump):
   pg_restore --clean --if-exists -d "postgresql://postgres:postgres@127.0.0.1:54322/postgres" prod_backup.dump

   # For plain SQL format (.sql):
   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f prod_backup.sql
   ```
3. Run the semester owner backfill script if testing with existing rows that have `userId = null`:
   ```bash
   DEPLOY_ENV=local npx tsx scripts/backfill-semester-user.ts <YOUR_LOCAL_USER_ID> --execute
   ```

---

## 4. Prisma Migrations

Always run migrations locally using `prisma migrate dev`. Do NOT use `prisma db push`.

```bash
# Generate Prisma Client
npx prisma generate

# Apply pending migrations and create new ones if schema changed
DEPLOY_ENV=local npx prisma migrate dev
```

---

## 5. Local MinIO Storage (S3-Compatible)

The app uses self-hosted S3-compatible storage via presigned PUT URLs (enforcing a 90MB file size limit).

1. Start MinIO locally via Docker:
   ```bash
   docker run -d \
     --name minio-dev \
     -p 9000:9000 \
     -p 9001:9001 \
     -e "MINIO_ROOT_USER=minioadmin" \
     -e "MINIO_ROOT_PASSWORD=minioadmin" \
     -v minio_data:/data \
     quay.io/minio/minio server /data --console-address ":9001"
   ```
2. Open the MinIO Web Console at `http://localhost:9001` (user: `minioadmin`, pass: `minioadmin`).
3. Create a bucket named `dashboard`.
4. Set CORS policy for the `dashboard` bucket (Bucket -> Anonymous / CORS rules):
   ```json
   [
     {
       "AllowedHeaders": ["*"],
       "AllowedMethods": ["GET", "PUT", "HEAD"],
       "AllowedOrigins": ["http://localhost:3000", "http://localhost:8080", "https://*.trycloudflare.com"],
       "ExposeHeaders": ["ETag"]
     }
   ]
   ```
5. Environment configuration:
   - `S3_ENDPOINT`: `http://127.0.0.1:9000` (server-side API calls)
   - `S3_PUBLIC_ENDPOINT`: `http://127.0.0.1:9000` (presigned URLs used by client browsers)
   - `S3_ACCESS_KEY_ID`: `minioadmin`
   - `S3_SECRET_ACCESS_KEY`: `minioadmin`
   - `S3_BUCKET_NAME`: `dashboard`
   - `S3_REGION`: `us-east-1`

---

## 6. VAPID Push Notification Keys

Generate dedicated local development VAPID keys:

```bash
npx web-push generate-vapid-keys
```

Copy the generated Public and Private keys into `.env.local`:
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`: `<Your-Generated-Public-Key>`
- `VAPID_PRIVATE_KEY`: `<Your-Generated-Private-Key>`
- `VAPID_EMAIL`: `mailto:dev@localhost`

---

## 7. Environment Variables Template (`.env.local`)

Create `.env.local` in the project root with the following template (all secrets are local placeholders):

```bash
# ─── Environment & Safety ────────────────────────────────────
DEPLOY_ENV=local
NODE_ENV=development

# ─── PostgreSQL Database (Prisma) ────────────────────────────
# Direct connection for migrations, pooled for queries
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres?schema=public"
DIRECT_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres?schema=public"

# ─── Supabase Authentication ─────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321"
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="<local-anon-key>"
SUPABASE_SERVICE_ROLE_KEY="<local-service-role-key>"

# ─── S3 / MinIO Storage (Presigned PUT, 90MB Max) ────────────
S3_ENDPOINT="http://127.0.0.1:9000"
S3_PUBLIC_ENDPOINT="http://127.0.0.1:9000"
S3_ACCESS_KEY_ID="minioadmin"
S3_SECRET_ACCESS_KEY="minioadmin"
S3_BUCKET_NAME="dashboard"
S3_REGION="us-east-1"

# ─── Web Push (VAPID) ────────────────────────────────────────
NEXT_PUBLIC_VAPID_PUBLIC_KEY="<local-vapid-public-key>"
VAPID_PRIVATE_KEY="<local-vapid-private-key>"
VAPID_EMAIL="mailto:dev@localhost"

# ─── Cron & Scheduler Authentication ─────────────────────────
# Static bearer token for local and third-party cron triggers
CRON_BEARER_TOKEN="dev-local-cron-bearer-token-12345"
# GCP OIDC token verification (optional in local dev, required on Cloud Run)
GCP_CRON_AUDIENCE=""
GCP_CRON_SERVICE_ACCOUNT_EMAIL=""

# ─── AI / OpenRouter ─────────────────────────────────────────
OPENROUTER_API_KEY="sk-or-v1-dev-dummy-key"
OPENROUTER_MODEL="anthropic/claude-3.5-haiku"
```

---

## 8. Running the Application

### Fast Development Mode
```bash
npm run dev
```
Available at `http://localhost:3000`.

### Production-Like Standalone Mode (`next build && next start`)
To test Turbopack compilation, standalone server bundling, and memory footprint:
```bash
npm run dev:prod-like
```

### Resource-Constrained Docker Smoke Test (`--memory=512m --cpus=1`)
To verify the container starts cleanly within Cloud Run's free tier / small instance limits:
```bash
npm run docker:smoke
```
This builds the production multi-stage Docker image and executes:
```bash
docker run --rm -p 8080:8080 --memory=512m --cpus=1 --env-file .env.local dashboard-management:smoke
```
Access the application at `http://localhost:8080`.

---

## 9. Mobile Phone Testing via Cloudflare Tunnel

Since the app is a mobile-first PWA, push notifications and service worker caching are best verified on a physical phone.

1. Start your local server (`npm run dev` on port 3000 or `npm run docker:smoke` on port 8080).
2. Start a Cloudflare Tunnel:
   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```
3. Copy the public tunnel HTTPS URL (e.g., `https://example-subdomain.trycloudflare.com`).
4. **Allowlist the redirect URL in Supabase**:
   - In Supabase Dashboard -> **Authentication** -> **URL Configuration**:
   - Add `https://example-subdomain.trycloudflare.com/auth/callback` to **Redirect URLs**.
   - Set Site URL to `https://example-subdomain.trycloudflare.com`.
5. Update `S3_PUBLIC_ENDPOINT` in `.env.local` to the public tunnel URL (if MinIO is also tunneled) so your phone can upload and view PDFs.
6. Open the HTTPS URL in mobile Safari or Chrome to test PWA installation, push subscription prompt, offline documents, and touch layout.
