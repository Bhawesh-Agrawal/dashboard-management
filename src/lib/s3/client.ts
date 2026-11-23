/**
 * S3/MinIO client with graceful fallback pattern.
 *
 * Uses the same globalThis singleton pattern as src/lib/prisma.ts
 * and the same tryS3() wrapper as tryAI() from src/lib/ai/openrouter.ts.
 *
 * Environment variables (already in .env):
 * - S3_ENDPOINT: MinIO endpoint (http://192.168.101.10:9004)
 * - S3_REGION: AWS region (us-east-1)
 * - S3_FORCE_PATH_STYLE: Use path-style URLs (true for MinIO)
 * - S3_ACCESS_KEY_ID: Access key
 * - S3_SECRET_ACCESS_KEY: Secret key
 * - S3_BUCKET: Bucket name (dashboard)
 */

import { S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import type { S3Result } from "./types";

// ─── Configuration ───────────────────────────────────────────

function getS3Config() {
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "S3 configuration incomplete. Check S3_ENDPOINT, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY."
    );
  }

  return { endpoint, accessKeyId, secretAccessKey };
}

// ─── Singleton (globalThis pattern from prisma.ts) ───────────

const globalForS3 = globalThis as unknown as {
  s3Client: S3Client | undefined;
};

function createS3Client(): S3Client {
  const config = getS3Config();

  return new S3Client({
    endpoint: config.endpoint,
    region: process.env.S3_REGION || "us-east-1",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export const s3Client = globalForS3.s3Client ?? createS3Client();
if (process.env.NODE_ENV !== "production") {
  globalForS3.s3Client = s3Client;
}

// ─── Constants ───────────────────────────────────────────────

if (process.env.NODE_ENV === "production" && !process.env.S3_PUBLIC_ENDPOINT) {
  throw new Error(
    "FATAL: S3_PUBLIC_ENDPOINT environment variable must be set in production (e.g. https://storage.yourdomain.com)."
  );
}

export const BUCKET_NAME = process.env.S3_BUCKET || "dashboard";
export const PUBLIC_ENDPOINT = process.env.S3_PUBLIC_ENDPOINT || process.env.S3_ENDPOINT || "";

// ─── URL helpers ─────────────────────────────────────────────

/**
 * Returns a publicly viewable URL for the given object key.
 * Works for MinIO with bucket-level public access or direct access.
 */
export function getPublicUrl(key: string): string {
  if (!PUBLIC_ENDPOINT) {
    throw new Error("S3_PUBLIC_ENDPOINT is not configured.");
  }
  return `${PUBLIC_ENDPOINT.replace(/\/$/, "")}/${BUCKET_NAME}/${key.replace(/^\//, "")}`;
}

/**
 * Returns a presigned URL for temporary read access (default: 1 hour).
 */
export async function getPresignedUrl(
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Returns a presigned PUT URL for direct browser upload (default: 15 minutes).
 */
export async function getUploadUrl(
  key: string,
  contentType: string,
  expiresIn: number = 900
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

// ─── Error-aware wrapper (mirrors tryAI from openrouter.ts) ──

/**
 * Categorizes S3 errors into user-friendly messages.
 */
function categorizeS3Error(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  // Network errors
  if (
    message.includes("ECONNREFUSED") ||
    message.includes("ENOTFOUND") ||
    message.includes("NetworkingError") ||
    message.includes("TimeoutError") ||
    message.includes("connect")
  ) {
    return "Unable to connect to storage server";
  }

  // Auth errors
  if (message.includes("403") || message.includes("AccessDenied")) {
    return "Storage access denied";
  }

  // Not found
  if (message.includes("404") || message.includes("NoSuchKey")) {
    return "File not found";
  }

  // Generic fallback
  return "Storage operation failed. Please try again later.";
}

/**
 * Shared error-handling wrapper for all S3 operations.
 * Catches errors and returns a structured error result instead of throwing.
 */
export async function tryS3<T>(
  fn: () => Promise<T>,
  context: string
): Promise<S3Result<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (error) {
    const errorMessage = categorizeS3Error(error);

    console.error(`\n[S3 ERROR] ${context}`);
    console.error(`  Endpoint:  ${process.env.S3_ENDPOINT}`);
    console.error(`  Bucket:    ${BUCKET_NAME}`);
    if (error instanceof Error) {
      console.error(`  Message:   ${error.message}`);
      const metadata = (error as any).$metadata;
      if (metadata) {
        console.error(`  HTTP:      ${metadata.httpStatusCode ?? "n/a"}`);
        console.error(`  RequestId: ${metadata.requestId ?? "n/a"}`);
        console.error(`  ExtReqId:  ${metadata.extendedRequestId ?? "n/a"}`);
      }
      if ((error as any).Code) {
        console.error(`  Code:      ${(error as any).Code}`);
      }
      if ((error as any).Region) {
        console.error(`  Region:    ${(error as any).Region}`);
      }
    } else {
      console.error(`  Raw:       ${String(error)}`);
    }
    console.error("");

    return { ok: false, error: errorMessage };
  }
}
