"use server";

import {
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getCurrentUserId } from "@/lib/auth";
import {
  s3Client,
  BUCKET_NAME,
  getPublicUrl,
  getUploadUrl,
  tryS3,
} from "./client";
import type {
  S3Result,
  S3UploadResult,
  S3FileMetadata,
  S3ListItem,
} from "./types";
import {
  ALLOWED_EXTENSIONS,
  BLOCKED_EXTENSIONS,
  FILE_SIZE_LIMITS,
  getFileType,
  getContentType,
  getExtension,
} from "./types";

// ─── Helpers ─────────────────────────────────────────────────

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 200);
}

function validateFile(file: File): string | null {
  const ext = getExtension(file.name);

  if (!ext) {
    return "File must have an extension";
  }

  if (BLOCKED_EXTENSIONS.has(ext)) {
    return "File type not allowed";
  }

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return "File type not allowed";
  }

  const contentType = getContentType(file.name);
  const fileType = getFileType(contentType);
  const maxSize = FILE_SIZE_LIMITS[fileType];

  if (file.size > maxSize) {
    const maxMB = Math.round(maxSize / (1024 * 1024));
    return `File exceeds maximum size of ${maxMB} MB`;
  }

  return null;
}

// ─── Server Actions ──────────────────────────────────────────

/**
 * Upload a file from the browser via multipart/form-data.
 * Expects a "file" field and an optional "folderPath" field.
 */
export async function uploadFile(
  formData: FormData
): Promise<S3Result<S3UploadResult>> {
  const userId = await getCurrentUserId();
  const file = formData.get("file") as File | null;
  const folderPath = (formData.get("folderPath") as string) || "uploads";

  if (!file || file.size === 0) {
    return { ok: false, error: "No file provided" };
  }

  const validationError = validateFile(file);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  const timestamp = Date.now();
  const safeName = sanitizeFilename(file.name);
  const key = `${userId}/${folderPath}/${timestamp}-${safeName}`;
  const contentType = file.type || getContentType(file.name);

  return tryS3(async () => {
    const buffer = Buffer.from(await file.arrayBuffer());

    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ContentLength: file.size,
      })
    );

    return {
      key,
      url: getPublicUrl(key),
      size: file.size,
      contentType,
    };
  }, "uploadFile");
}

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
 * The browser uploads directly to S3, bypassing the Next.js server.
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn: number = 900
): Promise<S3Result<{ url: string; key: string }>> {
  const userId = await getCurrentUserId();
  const fullKey = key.startsWith(`${userId}/`) ? key : `${userId}/${key.replace(/^\//, "")}`;

  return tryS3(async () => {
    const url = await getUploadUrl(fullKey, contentType, expiresIn);
    return { url, key: fullKey };
  }, "getPresignedUploadUrl");
}
