import { z } from "zod";
import type { AttachmentType } from "@prisma/client";

// ─── Enums ──────────────────────────────────────────────────

const AttachmentTypeEnum = z.enum([
  "PDF",
  "IMAGE",
  "VIDEO",
  "AUDIO",
  "DOCUMENT",
  "TEXT",
  "LINK",
  "OTHER",
]) as z.ZodType<AttachmentType>;

const FolderTypeEnum = z.enum([
  "PYQ",
  "RESOURCE_BOOK",
  "LECTURE_NOTE",
  "ASSIGNMENT",
  "REFERENCE",
  "PROJECT",
  "GENERAL",
]);

// ─── Attachment Input ───────────────────────────────────────

export const attachmentInputSchema = z.object({
  type: AttachmentTypeEnum,
  title: z.string().min(1, "Title is required").max(100, "Title must be 100 characters or less"),
  s3Key: z.string().min(1, "S3 key is required"),
  s3Url: z.string().url("Invalid S3 URL"),
  fileSize: z.number().int().positive("File size must be positive"),
  fileName: z.string().min(1, "File name is required"),
  mimeType: z.string().min(1, "MIME type is required"),
  thumbnailUrl: z.string().url().optional(),
  pageCount: z.number().int().positive().optional(),
});

// ─── Create Note ────────────────────────────────────────────

export const createNoteSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(200, "Title must be 200 characters or less")
    .optional(),
  content: z.string().min(1, "Content is required"),
  sourceType: z.enum(["typed", "ocr_photo", "voice"]).optional(),
  sourceLink: z.string().url().optional(),
  tags: z.array(z.string()).optional(),
  courseId: z.string().uuid().optional(),
  taskId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  folderId: z.string().uuid().nullable().optional(),
  attachments: z.array(attachmentInputSchema).optional(),
});

// ─── Create Document Note ──────────────────────────────────

export const createDocumentNoteSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(200, "Title must be 200 characters or less"),
  content: z.string().optional(),
  folderId: z.string().uuid().nullable().optional(),
  courseId: z.string().uuid().nullable().optional(),
  semesterId: z.string().uuid().nullable().optional(),
  taskId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  documentType: AttachmentTypeEnum,
  s3Key: z.string().min(1, "S3 key is required"),
  s3Url: z.string().url("Invalid S3 URL"),
  fileSize: z.number().int().positive("File size must be positive"),
  fileName: z.string().min(1, "File name is required"),
  mimeType: z.string().min(1, "MIME type is required"),
  thumbnailUrl: z.string().url().optional(),
  pageCount: z.number().int().positive().optional(),
  originalUrl: z.string().url().optional(),
  embedHtml: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

// ─── Update Document Note ──────────────────────────────────

export const updateDocumentNoteSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(200, "Title must be 200 characters or less")
    .optional(),
  content: z.string().optional(),
  folderId: z.string().uuid().nullable().optional(),
  courseId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string()).optional(),
  thumbnailUrl: z.string().url().optional(),
});

// ─── Document Filters ──────────────────────────────────────

export const documentFiltersSchema = z.object({
  folderId: z.string().uuid().nullable().optional(),
  courseId: z.string().uuid().nullable().optional(),
  taskId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  type: AttachmentTypeEnum.nullable().optional(),
  searchQuery: z.string().nullable().optional(),
  isFavorite: z.boolean().nullable().optional(),
  sortBy: z
    .enum(["createdAt", "title", "lastViewedAt", "fileSize"])
    .optional()
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
  page: z.number().int().min(1).optional().default(1),
  pageSize: z.number().int().min(1).max(100).optional().default(20),
});

// ─── Create Folder ─────────────────────────────────────────

export const createFolderSchema = z.object({
  name: z
    .string()
    .min(1, "Folder name is required")
    .max(100, "Folder name must be 100 characters or less"),
  description: z.string().max(500).optional(),
  type: FolderTypeEnum.optional().default("GENERAL"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Invalid hex color").optional(),
  icon: z.string().optional(),
  parentId: z.string().uuid().nullable().optional(),
  courseId: z.string().uuid().nullable().optional(),
  semesterId: z.string().uuid().nullable().optional(),
});

// ─── Update Folder ─────────────────────────────────────────

export const updateFolderSchema = z.object({
  name: z
    .string()
    .min(1, "Folder name is required")
    .max(100, "Folder name must be 100 characters or less")
    .optional(),
  description: z.string().max(500).nullable().optional(),
  type: FolderTypeEnum.optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Invalid hex color")
    .nullable()
    .optional(),
  icon: z.string().nullable().optional(),
  isPinned: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
  courseId: z.string().uuid().nullable().optional(),
  semesterId: z.string().uuid().nullable().optional(),
});

// ─── Create Annotation ─────────────────────────────────────

export const createAnnotationSchema = z.object({
  type: z.string().min(1, "Annotation type is required"),
  pageNumber: z.number().int().min(1, "Page number must be at least 1"),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  text: z.string().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Invalid hex color").optional(),
});

// ─── Update Annotation ─────────────────────────────────────

export const updateAnnotationSchema = z.object({
  type: z.string().min(1).optional(),
  text: z.string().nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Invalid hex color")
    .optional(),
});

// ─── Inferred Types ────────────────────────────────────────

export type AttachmentInputData = z.infer<typeof attachmentInputSchema>;
export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type CreateDocumentNoteData = z.infer<typeof createDocumentNoteSchema>;
export type UpdateDocumentNoteData = z.infer<typeof updateDocumentNoteSchema>;
export type DocumentFiltersData = z.infer<typeof documentFiltersSchema>;
export type CreateFolderData = z.infer<typeof createFolderSchema>;
export type UpdateFolderData = z.infer<typeof updateFolderSchema>;
export type CreateAnnotationData = z.infer<typeof createAnnotationSchema>;
export type UpdateAnnotationData = z.infer<typeof updateAnnotationSchema>;
