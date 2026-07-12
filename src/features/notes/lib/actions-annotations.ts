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
    x?: number;
    y?: number;
    width?: number;
    height?: number;
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

    if (!note) {
      return { ok: false, error: "Note not found" };
    }

    if (note.userId !== userId) {
      return { ok: false, error: "Access denied" };
    }

    const annotation = await prisma.noteAnnotation.create({
      data: {
        noteId,
        userId,
        type: data.type,
        pageNumber: data.pageNumber,
        x: data.x,
        y: data.y,
        width: data.width,
        height: data.height,
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
      select: { userId: true, noteId: true },
    });

    if (!annotation) {
      return { ok: false, error: "Annotation not found" };
    }

    if (annotation.userId !== userId) {
      return { ok: false, error: "Access denied" };
    }

    await prisma.noteAnnotation.update({ where: { id }, data });

    revalidatePath("/notes");
    revalidatePath(`/notes/${annotation.noteId}`);

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
      select: { userId: true, noteId: true },
    });

    if (!annotation) {
      return { ok: false, error: "Annotation not found" };
    }

    if (annotation.userId !== userId) {
      return { ok: false, error: "Access denied" };
    }

    await prisma.noteAnnotation.delete({ where: { id } });

    revalidatePath("/notes");
    revalidatePath(`/notes/${annotation.noteId}`);

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
    where: { noteId, userId },
    orderBy: [{ pageNumber: "asc" }, { createdAt: "asc" }],
  });
}
