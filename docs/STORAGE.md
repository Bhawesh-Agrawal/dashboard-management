# File & Document Storage Architecture

## Current Provider

- **S3-Compatible Object Storage** via `@aws-sdk/client-s3` (`src/lib/s3/client.ts`).
- Uploads go directly from the browser to the configured S3 endpoint using presigned `PUT` URLs (`getPresignedUploadUrl` in `src/lib/s3/actions.ts`), with a **90 MB** per-file limit (`94,371,840` bytes).
- Database rows (`FileAttachment` or `Note` document rows) are created **only after** the S3 upload completes so failed or cancelled uploads leave zero orphan DB rows.

## Readiness Check

- `GET /api/health/storage` (`src/app/api/health/storage/route.ts`) is an authenticated diagnostic endpoint that performs a `HeadBucketCommand` + `ListObjectsV2Command(MaxKeys: 1)` with a 3-second timeout (no real data writes).
- When unreachable, the Notes Files view displays `"Files are unavailable: storage offline"`.

## Future Provider Options

1. **Managed S3 / Cloudflare R2 / Supabase Storage (S3-compatible):** Zero code changes required—update `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and `S3_REGION` env vars.
2. **Google Cloud Storage (GCS) via S3 interoperability or native SDK:** Works with S3-interoperability HMAC keys today, or via a thin adapter replacing `getPresignedUploadUrl` / `getPresignedDownloadUrl`.
3. **Local MinIO / Garage (self-hosted):** Current default for local development; requires running the local S3 service.
