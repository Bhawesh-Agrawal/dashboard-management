"use server";

import {
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getCurrentUserId } from "@/lib/auth";
import {
  s3Client,
  BUCKET_NAME,
  getUploadUrl,
  tryS3,
} from "./client";
import type {
  S3Result,
  S3FileMetadata,
  S3ListItem,
} from "./types";
import {
  BLOCKED_EXTENSIONS,
  MAX_FILE_SIZE,
  getExtension,
} from "./types";

// ─── Server Actions ──────────────────────────────────────────

/**
 * Delete a file from S3.
 * Verifies the key belongs to the current user.
 */
export async function deleteFile(key: string): Promise<S3Result<void>> {
  const userId = await getCurrentUserId();
  const fullKey = key.startsWith(`${userId}/`) ? key : `${userId}/${key.replace(/^\//, "")}`;

  return tryS3(async () => {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: fullKey,
      })
    );
  }, "deleteFile");
}

/**
 * Get metadata for a file (size, last modified, content type).
 */
export async function getFileMetadata(
  key: string
): Promise<S3Result<S3FileMetadata>> {
  return tryS3(async () => {
    const response = await s3Client.send(
      new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      })
    );

    return {
      key,
      size: response.ContentLength ?? 0,
      lastModified: response.LastModified ?? new Date(),
      contentType: response.ContentType ?? "application/octet-stream",
    };
  }, "getFileMetadata");
}

/**
 * List files under a given prefix (folder browsing).
 */
export async function listFiles(
  prefix: string
): Promise<S3Result<S3ListItem[]>> {
  const userId = await getCurrentUserId();
  const fullPrefix = prefix.startsWith(userId)
    ? prefix
    : `${userId}/${prefix.replace(/^\//, "")}`;

  return tryS3(async () => {
    const response = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: fullPrefix.endsWith("/") ? fullPrefix : `${fullPrefix}/`,
      })
    );

    return (response.Contents ?? [])
      .filter((item): item is NonNullable<typeof item> => item.Key != null)
      .map((item) => ({
        key: item.Key!,
        size: item.Size ?? 0,
        lastModified: item.LastModified ?? new Date(),
      }));
  }, "listFiles");
}

// ─── Presigned URL for direct browser upload ─────────────────

/**
 * Generate a presigned PUT URL for direct browser-to-MinIO upload.
 * The browser uploads directly to S3 via presigned PUT, bypassing the Next.js server.
 * Enforces a strict 90MB file size limit on the server side.
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  fileSize?: number,
  expiresIn: number = 900
): Promise<S3Result<{ url: string; key: string }>> {
  if (fileSize && fileSize > MAX_FILE_SIZE) {
    return { ok: false, error: "File exceeds maximum size of 90 MB" };
  }

  const ext = getExtension(key);
  if (ext && BLOCKED_EXTENSIONS.has(ext)) {
    return { ok: false, error: "File type not allowed" };
  }

  const userId = await getCurrentUserId();
  const fullKey = key.startsWith(`${userId}/`) ? key : `${userId}/${key.replace(/^\//, "")}`;

  return tryS3(async () => {
    const url = await getUploadUrl(fullKey, contentType, expiresIn);
    return { url, key: fullKey };
  }, "getPresignedUploadUrl");
}
