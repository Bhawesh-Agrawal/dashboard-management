"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/auth";

// ─── Create Annotation ───────────────────────────────────────

export async function createAnnotation(
  noteId: string,
  data: {
    type: string;
    pageNumber: number;
    position?: any;
    text?: string;
    color?: string;
  }
): Promise<{ ok: true; data: { id: string } } | { ok: false; error: string }> {
  try {
    const userId = await getCurrentUserId();

    const note = await prisma.note.findUnique({
      where: { id: noteId },
      select: { userId: true },
    });

    const file = !note ? await prisma.fileAttachment.findUnique({
      where: { id: noteId },
      select: { userId: true },
    }) : null;

    if (!note && !file) {
      return { ok: false, error: "Document not found" };
    }

    if (note && note.userId && note.userId !== userId) {
      return { ok: false, error: "Access denied" };
    }
    
    if (file && file.userId && file.userId !== userId) {
      return { ok: false, error: "Access denied" };
    }

    const annotation = await prisma.noteAnnotation.create({
      data: {
        noteId: note ? noteId : null,
        fileAttachmentId: file ? noteId : null,
        userId,
        type: data.type,
        pageNumber: data.pageNumber,
        position: data.position ?? {},
        text: data.text,
        color: data.color ?? "#FFD700",
      },
      select: { id: true },
    });

    revalidatePath("/notes");
    revalidatePath(`/notes/${noteId}`);

    return { ok: true, data: annotation };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to create annotation:", message);
    return { ok: false, error: "Failed to create annotation" };
  }
}

// ─── Update Annotation ───────────────────────────────────────

export async function updateAnnotation(
  id: string,
  data: {
    type?: string;
    text?: string | null;
    color?: string;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const userId = await getCurrentUserId();

    const annotation = await prisma.noteAnnotation.findUnique({
      where: { id },
      select: { userId: true, noteId: true, fileAttachmentId: true },
    });

    if (!annotation) {
      return { ok: false, error: "Annotation not found" };
    }

    if (annotation.userId !== userId) {
      return { ok: false, error: "Access denied" };
    }

    await prisma.noteAnnotation.update({ where: { id }, data });

    revalidatePath("/notes");
    if (annotation.noteId) {
      revalidatePath(`/notes/${annotation.noteId}`);
    } else if (annotation.fileAttachmentId) {
      // Revalidate course/semester page if needed, but /notes is usually enough for library
      revalidatePath(`/notes/${annotation.fileAttachmentId}`);
    }

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to update annotation:", message);
    return { ok: false, error: "Failed to update annotation" };
  }
}

// ─── Delete Annotation ───────────────────────────────────────

export async function deleteAnnotation(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const userId = await getCurrentUserId();

    const annotation = await prisma.noteAnnotation.findUnique({
      where: { id },
      select: { userId: true, noteId: true, fileAttachmentId: true },
    });

    if (!annotation) {
      return { ok: false, error: "Annotation not found" };
    }

    if (annotation.userId !== userId) {
      return { ok: false, error: "Access denied" };
    }

    await prisma.noteAnnotation.delete({ where: { id } });

    revalidatePath("/notes");
    if (annotation.noteId) {
      revalidatePath(`/notes/${annotation.noteId}`);
    } else if (annotation.fileAttachmentId) {
      revalidatePath(`/notes/${annotation.fileAttachmentId}`);
    }

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to delete annotation:", message);
    return { ok: false, error: "Failed to delete annotation" };
  }
}

// ─── Get Annotations ─────────────────────────────────────────

export async function getAnnotations(noteId: string) {
  const userId = await getCurrentUserId();

  return prisma.noteAnnotation.findMany({
    where: {
      OR: [
        { noteId },
        { fileAttachmentId: noteId }
      ],
      userId 
    },
    orderBy: [{ pageNumber: "asc" }, { createdAt: "asc" }],
  });
}
