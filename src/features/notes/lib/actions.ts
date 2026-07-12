"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/auth";
import { generateSemanticLinks } from "./semantic-links";
import { markNoteReviewed as markReviewed } from "./spaced-repetition";
import { createExplicitLink as createLink, removeLink as deleteLink } from "./semantic-links";
import { addNoteAttachment, removeNoteAttachment } from "./actions-attachments";

export async function createNote(data: {
  title?: string;
  content: string;
  sourceType?: "typed" | "ocr_photo" | "voice";
  sourceLink?: string;
  tags?: string[];
  courseId?: string;
}) {
  const userId = await getCurrentUserId();
  const note = await prisma.note.create({
    data: { ...data, userId },
  });

  revalidatePath("/notes");
  if (data.courseId) revalidatePath(`/courses/${data.courseId}`);

  // Trigger semantic linking asynchronously (don't await - background job)
  generateSemanticLinks(note.id).catch(console.error);

  return note;
}

export async function updateNote(
  id: string,
  data: {
    title?: string | null;
    content?: string;
    sourceLink?: string | null;
    tags?: string[];
    courseId?: string | null;
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

  // Re-generate semantic links if content changed
  if (data.content) {
    generateSemanticLinks(id).catch(console.error);
  }

  return note;
}

export async function deleteNote(id: string) {
  const note = await prisma.note.delete({
    where: { id },
    select: { courseId: true },
  });
  revalidatePath("/notes");
  if (note.courseId) revalidatePath(`/courses/${note.courseId}`);
}

export async function reviewNote(noteId: string): Promise<void> {
  await markReviewed(noteId);
  revalidatePath("/notes");
  revalidatePath(`/notes/${noteId}`);
}

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
// Wrappers delegating to actions-attachments.ts

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
