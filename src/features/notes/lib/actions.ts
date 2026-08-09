"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/auth";
import { deleteFile } from "@/lib/s3/actions";
import { getPresignedUrl } from "@/lib/s3/client";
import { generateSemanticLinks } from "./semantic-links";
import { markNoteReviewed as markReviewed } from "./spaced-repetition";
import { createExplicitLink as createLink, removeLink as deleteLink } from "./semantic-links";
import { addNoteAttachment, removeNoteAttachment } from "./actions-attachments";
import { createNoteSchema } from "./validation";
import type { AttachmentInput } from "@/types";

// ─── Create Note ────────────────────────────────────────────

export async function createNote(data: {
  title?: string;
  content: string;
  sourceType?: "typed" | "ocr_photo" | "voice";
  sourceLink?: string;
  tags?: string[];
  courseId?: string;
  taskId?: string;
  projectId?: string;
  folderId?: string | null;
  attachments?: AttachmentInput[];
}): Promise<{ ok: true; data: { id: string } } | { ok: false; error: string }> {
  try {
    const userId = await getCurrentUserId();

    const validated = createNoteSchema.safeParse(data);
    if (!validated.success) {
      return { ok: false, error: validated.error.issues[0].message };
    }

    const { attachments, ...noteData } = validated.data;

    const note = await prisma.note.create({
      data: { ...noteData, userId },
      select: { id: true },
    });

    if (attachments && attachments.length > 0) {
      const maxSort = await prisma.noteAttachment.aggregate({
        where: { noteId: note.id },
        _max: { sortOrder: true },
      });

      let sortOrder = (maxSort._max.sortOrder ?? -1) + 1;

      await prisma.noteAttachment.createMany({
        data: attachments.map((att) => ({
          noteId: note.id,
          userId,
          type: att.type,
          title: att.title,
          s3Key: att.s3Key,
          s3Url: att.s3Url,
          fileSize: att.fileSize,
          fileName: att.fileName,
          mimeType: att.mimeType,
          thumbnailUrl: att.thumbnailUrl,
          pageCount: att.pageCount,
          sortOrder: sortOrder++,
        })),
      });
    }

    revalidatePath("/notes");
    if (data.courseId) revalidatePath(`/courses/${data.courseId}`);
    if (data.taskId) revalidatePath("/tasks");
    if (data.projectId) revalidatePath(`/projects/${data.projectId}`);

    generateSemanticLinks(note.id).catch(console.error);

    return { ok: true, data: note };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to create note:", message);
    return { ok: false, error: "Failed to create note" };
  }
}

// ─── Update Note ────────────────────────────────────────────

export async function updateNote(
  id: string,
  data: {
    title?: string | null;
    content?: string;
    sourceLink?: string | null;
    tags?: string[];
    courseId?: string | null;
    taskId?: string | null;
    projectId?: string | null;
    folderId?: string | null;
    isDocumentLibraryEntry?: boolean;
    documentType?: "PDF" | "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "TEXT" | "LINK" | "OTHER" | null;
    s3Key?: string | null;
    s3Url?: string | null;
    fileSize?: number | null;
    fileName?: string | null;
    mimeType?: string | null;
    pageCount?: number | null;
    thumbnailUrl?: string | null;
    originalUrl?: string | null;
    embedHtml?: string | null;
    extractedText?: string | null;
  }
) {
  const note = await prisma.note.update({ where: { id }, data });
  revalidatePath("/notes");
  revalidatePath(`/notes/${id}`);
  if (note.courseId) revalidatePath(`/courses/${note.courseId}`);
  if (note.taskId) revalidatePath("/tasks");
  if (note.projectId) revalidatePath(`/projects/${note.projectId}`);

  if (data.content) {
    generateSemanticLinks(id).catch(console.error);
  }

  return note;
}

// ─── Delete Note ────────────────────────────────────────────

export async function deleteNote(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const userId = await getCurrentUserId();

    const note = await prisma.note.findUnique({
      where: { id },
      select: {
        userId: true,
        courseId: true,
        s3Key: true,
        noteAttachments: { select: { id: true, s3Key: true } },
      },
    });

    if (!note) {
      return { ok: false, error: "Note not found" };
    }

    if (note.userId !== userId) {
      return { ok: false, error: "Access denied" };
    }

    const s3KeysToDelete: string[] = [];
    if (note.s3Key) {
      s3KeysToDelete.push(note.s3Key);
    }
    for (const attachment of note.noteAttachments) {
      if (attachment.s3Key) {
        s3KeysToDelete.push(attachment.s3Key);
      }
    }

    for (const key of s3KeysToDelete) {
      const result = await deleteFile(key);
      if (!result.ok) {
        return { ok: false, error: `Failed to delete file from storage: ${key}` };
      }
    }

    await prisma.noteAnnotation.deleteMany({ where: { noteId: id } });
    await prisma.noteAttachment.deleteMany({ where: { noteId: id } });
    await prisma.note.delete({ where: { id } });

    revalidatePath("/notes");
    if (note.courseId) revalidatePath(`/courses/${note.courseId}`);

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to delete note:", message);
    return { ok: false, error: "Failed to delete note" };
  }
}

// ─── Record Note View ───────────────────────────────────────

export async function recordNoteView(
  noteId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const userId = await getCurrentUserId();

    const note = await prisma.note.findUnique({
      where: { id: noteId },
      select: { userId: true },
    });

    if (!note) {
      return { ok: false, error: "Note not found" };
    }

    if (note.userId !== userId) {
      return { ok: false, error: "Access denied" };
    }

    await prisma.note.update({
      where: { id: noteId },
      data: {
        viewCount: { increment: 1 },
        lastViewedAt: new Date(),
      },
    });

    revalidatePath(`/notes/${noteId}`);

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to record note view:", message);
    return { ok: false, error: "Failed to record view" };
  }
}

// ─── Review Note ────────────────────────────────────────────

export async function reviewNote(noteId: string): Promise<void> {
  await markReviewed(noteId);
  revalidatePath("/notes");
  revalidatePath(`/notes/${noteId}`);
}

// ─── Explicit Links ─────────────────────────────────────────

export async function createExplicitLink(
  sourceId: string,
  targetId: string
): Promise<void> {
  await createLink(sourceId, targetId);
  revalidatePath("/notes");
  revalidatePath(`/notes/${sourceId}`);
  revalidatePath(`/notes/${targetId}`);
}

export async function removeExplicitLink(
  sourceId: string,
  targetId: string
): Promise<void> {
  await deleteLink(sourceId, targetId);
  revalidatePath("/notes");
  revalidatePath(`/notes/${sourceId}`);
  revalidatePath(`/notes/${targetId}`);
}

// ─── Attachments ────────────────────────────────────────────

export async function addAttachments(
  noteId: string,
  data: {
    type: "PDF" | "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "TEXT" | "LINK" | "OTHER";
    title: string;
    s3Key: string;
    s3Url: string;
    fileSize: number;
    fileName: string;
    mimeType: string;
    thumbnailUrl?: string;
    pageCount?: number;
    extractedText?: string;
  }
) {
  return addNoteAttachment(noteId, data);
}

export async function removeAttachment(id: string) {
  return removeNoteAttachment(id);
}

// ─── File View URL ─────────────────────────────────────────

/**
 * Generate a presigned GET URL for viewing any file (PDF, image, video, etc).
 * The stored s3Url is a PUT URL (for uploads); this generates a fresh read URL.
 * Pass attachmentId to view an attachment's file instead of the note's own file.
 */
export async function getFileViewUrl(
  noteId: string,
  attachmentId?: string,
  directS3Key?: string
): Promise<{ ok: true; data: { url: string } } | { ok: false; error: string }> {
  try {
    const userId = await getCurrentUserId();

    let s3Key: string | null = null;

    // If an S3 key is provided directly (e.g. from file attachments), skip DB lookup
    if (directS3Key) {
      s3Key = directS3Key;
    } else if (attachmentId) {
      // Look up attachment's s3Key
      const note = await prisma.note.findUnique({
        where: { id: noteId },
        select: { userId: true },
      });

      if (!note) {
        return { ok: false, error: "Note not found" };
      }

      if (note.userId !== userId) {
        return { ok: false, error: "Access denied" };
      }

      const attachment = await prisma.noteAttachment.findUnique({
        where: { id: attachmentId },
        select: { s3Key: true, noteId: true },
      });
      if (!attachment || attachment.noteId !== noteId) {
        return { ok: false, error: "Attachment not found" };
      }
      s3Key = attachment.s3Key;
    } else {
      // Look up note's own s3Key
      const note = await prisma.note.findUnique({
        where: { id: noteId },
        select: { userId: true, s3Key: true },
      });

      if (!note) {
        return { ok: false, error: "Note not found" };
      }

      if (note.userId !== userId) {
        return { ok: false, error: "Access denied" };
      }

      s3Key = note.s3Key;
    }

    if (!s3Key) {
      return { ok: false, error: "No file attached" };
    }

    const url = await getPresignedUrl(s3Key, 3600);
    return { ok: true, data: { url } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to generate PDF view URL:", message);
    return { ok: false, error: "Failed to generate view URL" };
  }
}

/** @deprecated Use getFileViewUrl instead */
export const getPdfViewUrl = getFileViewUrl;
