"use server";

import type { EventType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function createCalendarEventAction(input: {
  title: string;
  date: string; // YYYY-MM-DD
  startTime?: string; // HH:MM
  endTime?: string; // HH:MM
  type?: string;
  location?: string;
}) {
  const userId = await getCurrentUserId();
  const timePart = input.startTime ? `${input.startTime}:00` : "09:00:00";
  const dateTime = new Date(`${input.date}T${timePart}.000Z`);
  const endTime = input.endTime
    ? new Date(`${input.date}T${input.endTime}:00.000Z`)
    : null;

  const validTypes = new Set(["general", "exam", "holiday", "deadline", "personal", "birthday"]);
  const mappedType =
    input.type && validTypes.has(input.type)
      ? (input.type as EventType)
      : input.type === "event"
        ? ("general" as EventType)
        : ("general" as EventType);

  const event = await prisma.event.create({
    data: {
      userId,
      title: input.title,
      dateTime,
      endTime,
      location: input.location || null,
      eventType: mappedType,
    },
    select: { id: true, title: true },
  });

  revalidatePath("/calendar");
  revalidatePath("/today");
  return event;
}
