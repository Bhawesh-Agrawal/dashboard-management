"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/auth";
import { generateSemanticLinks } from "./semantic-links";
import { markNoteReviewed as markReviewed } from "./spaced-repetition";
import { createExplicitLink as createLink, removeLink as deleteLink } from "./semantic-links";

export async function createNote(data: {
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
    content?: string;
    sourceLink?: string | null;
    tags?: string[];
    courseId?: string | null;
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
