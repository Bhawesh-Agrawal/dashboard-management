"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/auth";
import { deleteFile as deleteS3File } from "@/lib/s3/actions";

export type FileAttachment = {
  id: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  key: string;
  url: string;
  semesterId: string | null;
  courseId: string | null;
  category: string | null;
  tags: string[];
  description: string | null;
  uploadedAt: Date;
};

export type CreateFileAttachmentInput = {
  fileName: string;
  fileSize: number;
  contentType: string;
  key: string;
  url: string;
  semesterId?: string;
  courseId?: string;
  category?: string;
  tags?: string[];
  description?: string;
};

// ─── Upload Context Options (for dropdowns) ────────────────

export async function getUploadContextOptions() {
  const semesters = await prisma.semester.findMany({
    orderBy: { startDate: "desc" },
    select: { id: true, name: true },
  });

  const courses = await prisma.course.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true, semesterId: true },
  });

  return { semesters, courses };
}

// ─── Create ─────────────────────────────────────────────────

export async function createFileAttachment(
  input: CreateFileAttachmentInput
): Promise<{ ok: true; data: FileAttachment } | { ok: false; error: string }> {
  try {
    const userId = await getCurrentUserId();

    // Verify semester exists if provided
    if (input.semesterId) {
      const semester = await prisma.semester.findUnique({
        where: { id: input.semesterId },
        select: { id: true },
      });
      if (!semester) {
        return { ok: false, error: "Semester not found" };
      }
    }

    // Verify course exists if provided
    if (input.courseId) {
      const course = await prisma.course.findUnique({
        where: { id: input.courseId },
        select: { id: true },
      });
      if (!course) {
        return { ok: false, error: "Course not found" };
      }
    }

    const file = await prisma.fileAttachment.create({
      data: {
        userId,
        fileName: input.fileName,
        fileSize: input.fileSize,
        contentType: input.contentType,
        key: input.key,
        url: input.url,
        semesterId: input.semesterId || null,
        courseId: input.courseId || null,
        category: input.category || null,
        tags: input.tags || [],
        description: input.description || null,
      },
    });

    revalidatePath("/notes");
    if (input.courseId) revalidatePath(`/courses/${input.courseId}`);
    if (input.semesterId) revalidatePath(`/semesters/${input.semesterId}`);

    return { ok: true, data: file as FileAttachment };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to create file attachment:", message);
    return { ok: false, error: "Failed to save file" };
  }
}

// ─── Delete ─────────────────────────────────────────────────

export async function deleteFileAttachment(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const file = await prisma.fileAttachment.findUnique({
      where: { id },
      select: { key: true, courseId: true, semesterId: true },
    });

    if (!file) {
      return { ok: false, error: "File not found" };
    }

    // Delete from S3
    const s3Result = await deleteS3File(file.key);
    if (!s3Result.ok) {
      console.warn("Failed to delete from S3:", s3Result.error);
    }

    // Delete from database
    await prisma.fileAttachment.delete({ where: { id } });

    revalidatePath("/notes");
    if (file.courseId) revalidatePath(`/courses/${file.courseId}`);
    if (file.semesterId) revalidatePath(`/semesters/${file.semesterId}`);

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to delete file attachment:", message);
    return { ok: false, error: "Failed to delete file" };
  }
}

// ─── Update ─────────────────────────────────────────────────

export async function updateFileAttachment(
  id: string,
  data: {
    category?: string;
    tags?: string[];
    description?: string;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const file = await prisma.fileAttachment.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!file) {
      return { ok: false, error: "File not found" };
    }

    await prisma.fileAttachment.update({ where: { id }, data });

    revalidatePath("/notes");

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to update file attachment:", message);
    return { ok: false, error: "Failed to update file" };
  }
}

// ─── List ───────────────────────────────────────────────────

export async function getFileAttachments(filters: {
  semesterId?: string;
  courseId?: string;
  noteId?: string;
  category?: string;
  tags?: string[];
}): Promise<{ ok: true; data: FileAttachment[] } | { ok: false; error: string }> {
  try {
    const where: Record<string, unknown> = {};

    if (filters.semesterId) where.semesterId = filters.semesterId;
    if (filters.courseId) where.courseId = filters.courseId;
    if (filters.noteId) where.noteId = filters.noteId;
    if (filters.category) where.category = filters.category;
    if (filters.tags && filters.tags.length > 0) {
      where.tags = { hasSome: filters.tags };
    }

    const files = await prisma.fileAttachment.findMany({
      where,
      orderBy: { uploadedAt: "desc" },
    });

    return { ok: true, data: files as FileAttachment[] };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to list file attachments:", message);
    return { ok: false, error: "Failed to load files" };
  }
}
