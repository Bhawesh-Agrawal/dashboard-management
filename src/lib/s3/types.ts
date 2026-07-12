/**
 * S3/MinIO storage types and constants.
 *
 * Used by the client and server-action layers.
 */

// ─── Result type (mirrors AIResult) ──────────────────────────
export type S3Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ─── Upload result ───────────────────────────────────────────
export type S3UploadResult = {
  key: string;
  url: string;
  size: number;
  contentType: string;
};

// ─── File metadata ───────────────────────────────────────────
export type S3FileMetadata = {
  key: string;
  size: number;
  lastModified: Date;
  contentType: string;
};

// ─── List result ─────────────────────────────────────────────
export type S3ListItem = {
  key: string;
  size: number;
  lastModified: Date;
};

// ─── File type classification ────────────────────────────────
export enum FileType {
  PDF = "PDF",
  IMAGE = "IMAGE",
  VIDEO = "VIDEO",
  AUDIO = "AUDIO",
  DOCUMENT = "DOCUMENT",
  TEXT = "TEXT",
  OTHER = "OTHER",
}

const MIME_TO_FILE_TYPE: Record<string, FileType> = {
  "application/pdf": FileType.PDF,
  "image/jpeg": FileType.IMAGE,
  "image/jpg": FileType.IMAGE,
  "image/png": FileType.IMAGE,
  "image/gif": FileType.IMAGE,
  "image/webp": FileType.IMAGE,
  "video/mp4": FileType.VIDEO,
  "audio/mpeg": FileType.AUDIO,
  "audio/mp3": FileType.AUDIO,
  "application/msword": FileType.DOCUMENT,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    FileType.DOCUMENT,
  "text/plain": FileType.TEXT,
  "text/markdown": FileType.TEXT,
};

export function getFileType(contentType: string): FileType {
  return MIME_TO_FILE_TYPE[contentType.toLowerCase()] ?? FileType.OTHER;
}

// ─── Allowed extensions ──────────────────────────────────────
export const ALLOWED_EXTENSIONS = new Set([
  "pdf",
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "mp4",
  "mp3",
  "doc",
  "docx",
  "txt",
  "md",
]);

// ─── Blocked extensions (security) ───────────────────────────
export const BLOCKED_EXTENSIONS = new Set([
  "exe",
  "js",
  "mjs",
  "cjs",
  "html",
  "htm",
  "svg",
  "bat",
  "cmd",
  "sh",
  "ps1",
  "vbs",
  "vbe",
  "wsf",
  "wsh",
  "msi",
  "dll",
  "com",
  "scr",
  "pif",
  "hta",
  "cpl",
  "jar",
  "ws",
  "wsf",
]);

// ─── File size limits (bytes) ────────────────────────────────
const MB = 1024 * 1024;

export const FILE_SIZE_LIMITS: Record<FileType, number> = {
  [FileType.PDF]: 50 * MB,
  [FileType.IMAGE]: 10 * MB,
  [FileType.VIDEO]: 100 * MB,
  [FileType.AUDIO]: 50 * MB,
  [FileType.DOCUMENT]: 20 * MB,
  [FileType.TEXT]: 5 * MB,
  [FileType.OTHER]: 10 * MB,
};

// ─── MIME type mapping (extension → content type) ────────────
const EXTENSION_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  mp4: "video/mp4",
  mp3: "audio/mpeg",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  md: "text/markdown",
};

export function getContentType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_TO_MIME[ext] ?? "application/octet-stream";
}

export function getExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}
