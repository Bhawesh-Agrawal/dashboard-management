"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export interface DocumentLibraryChoice {
  id: string;
  title: string;
  fileName: string | null;
}

export async function getDocumentLibraryChoicesAction(): Promise<DocumentLibraryChoice[]> {
  try {
    const userId = await getCurrentUserId();
    const notes = await prisma.note.findMany({
      where: { userId, isDocumentLibraryEntry: true },
      orderBy: { updatedAt: "desc" },
      take: 30,
      select: { id: true, title: true, fileName: true },
    });
    return notes.map((n) => ({
      id: n.id,
      title: n.fileName || n.title || "Untitled document",
      fileName: n.fileName,
    }));
  } catch {
    return [];
  }
}

export async function attachTravelMetadataToEventAction(input: {
  eventId?: string;
  title?: string;
  dateTime?: string;
  isTravel: boolean;
  noteIds: string[];
}): Promise<{ success: boolean }> {
  try {
    const userId = await getCurrentUserId();

    let targetEventId = input.eventId;
    if (!targetEventId && input.title && input.dateTime) {
      const targetDate = new Date(input.dateTime);
      const found = await prisma.event.findFirst({
        where: {
          userId,
          title: input.title,
          dateTime: targetDate,
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      targetEventId = found?.id;
    }

    if (!targetEventId) {
      return { success: false };
    }

    const updated = await prisma.event.updateMany({
      where: { id: targetEventId, userId },
      data: { isTravel: input.isTravel },
    });
    if (updated.count === 0) return { success: false };

    if (input.noteIds.length > 0) {
      const ownedNotes = await prisma.note.findMany({
        where: { userId, id: { in: input.noteIds } },
        select: { id: true },
      });
      for (const n of ownedNotes) {
        await prisma.eventDocument.upsert({
          where: {
            eventId_noteId: {
              eventId: targetEventId,
              noteId: n.id,
            },
          },
          create: {
            eventId: targetEventId,
            noteId: n.id,
          },
          update: {},
        });
      }
    }

    revalidatePath("/brief");
    revalidatePath("/calendar");
    return { success: true };
  } catch (error) {
    console.error("Failed to attach travel metadata:", error);
    return { success: false };
  }
}
