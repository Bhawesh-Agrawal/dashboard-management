"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/auth";
import type { AttachmentType } from "@prisma/client";

// ─── Add Note Attachment ─────────────────────────────────────

export async function addNoteAttachment(
  noteId: string,
  data: {
    type: AttachmentType;
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
): Promise<{ ok: true; data: { id: string } } | { ok: false; error: string }> {
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

    // Get next sort order
    const maxSort = await prisma.noteAttachment.aggregate({
      where: { noteId },
      _max: { sortOrder: true },
    });

    const attachment = await prisma.noteAttachment.create({
      data: {
        noteId,
        userId,
        type: data.type,
        title: data.title,
        s3Key: data.s3Key,
        s3Url: data.s3Url,
        fileSize: data.fileSize,
        fileName: data.fileName,
        mimeType: data.mimeType,
        thumbnailUrl: data.thumbnailUrl,
        pageCount: data.pageCount,
        extractedText: data.extractedText,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
      select: { id: true },
    });

    revalidatePath("/notes");
    revalidatePath(`/notes/${noteId}`);

    return { ok: true, data: attachment };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to add note attachment:", message);
    return { ok: false, error: "Failed to save attachment" };
  }
}

// ─── Remove Note Attachment ──────────────────────────────────

export async function removeNoteAttachment(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const userId = await getCurrentUserId();

    const attachment = await prisma.noteAttachment.findUnique({
      where: { id },
      select: { userId: true, noteId: true },
    });

    if (!attachment) {
      return { ok: false, error: "Attachment not found" };
    }

    if (attachment.userId !== userId) {
      return { ok: false, error: "Access denied" };
    }

    await prisma.noteAttachment.delete({ where: { id } });

    revalidatePath("/notes");
    revalidatePath(`/notes/${attachment.noteId}`);

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to remove note attachment:", message);
    return { ok: false, error: "Failed to remove attachment" };
  }
}

// ─── Update Note Attachment ──────────────────────────────────

export async function updateNoteAttachment(
  id: string,
  data: {
    title?: string;
    sortOrder?: number;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const userId = await getCurrentUserId();

    const attachment = await prisma.noteAttachment.findUnique({
      where: { id },
      select: { userId: true, noteId: true },
    });

    if (!attachment) {
      return { ok: false, error: "Attachment not found" };
    }

    if (attachment.userId !== userId) {
      return { ok: false, error: "Access denied" };
    }

    await prisma.noteAttachment.update({ where: { id }, data });

    revalidatePath("/notes");
    revalidatePath(`/notes/${attachment.noteId}`);

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to update note attachment:", message);
    return { ok: false, error: "Failed to update attachment" };
  }
}

// ─── Add Note Link Attachment ────────────────────────────────

export async function addNoteLinkAttachment(
  noteId: string,
  data: { url: string; title: string; description?: string; favicon?: string }
): Promise<{ ok: true; data: { id: string } } | { ok: false; error: string }> {
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

    const maxSort = await prisma.noteAttachment.aggregate({
      where: { noteId },
      _max: { sortOrder: true },
    });

    const attachment = await prisma.noteAttachment.create({
      data: {
        noteId,
        userId,
        type: "LINK",
        title: data.title,
        s3Key: data.url,
        s3Url: data.url,
        fileSize: 0,
        fileName: data.url,
        mimeType: "text/uri-list",
        thumbnailUrl: data.favicon,
        extractedText: data.description,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
      select: { id: true },
    });

    revalidatePath("/notes");
    revalidatePath(`/notes/${noteId}`);

    return { ok: true, data: attachment };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to add note link attachment:", message);
    return { ok: false, error: "Failed to save link" };
  }
}

// ─── Get Note Attachments ────────────────────────────────────

export async function getNoteAttachments(noteId: string) {
  const userId = await getCurrentUserId();

  return prisma.noteAttachment.findMany({
    where: { noteId, userId },
    orderBy: { sortOrder: "asc" },
  });
}
