"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { ownerWhere } from "@/lib/owner-scoping";
import { revalidatePath } from "next/cache";

export async function createRoutine(data: {
  name: string;
  timeOfDay: "morning" | "afternoon" | "evening" | "anytime";
  specificTime?: string;
  streakGoal?: number;
  activeDays: ("MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN")[];
}) {
  const userId = await getCurrentUserId();
  const routine = await prisma.routine.create({ data: { ...data, userId } });
  revalidatePath("/routines");
  revalidatePath("/today");
  return routine;
}

export async function updateRoutine(
  id: string,
  data: {
    name?: string;
    timeOfDay?: "morning" | "afternoon" | "evening" | "anytime";
    specificTime?: string | null;
    streakGoal?: number | null;
    activeDays?: ("MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN")[];
  }
) {
  const userId = await getCurrentUserId();
  const existing = await prisma.routine.findFirst({
    where: { id, ...ownerWhere(userId) },
    select: { id: true },
  });
  if (!existing) throw new Error("Routine not found");

  const routine = await prisma.routine.update({ where: { id }, data });
  revalidatePath("/routines");
  revalidatePath("/today");
  return routine;
}

export async function deleteRoutine(id: string) {
  const userId = await getCurrentUserId();
  const existing = await prisma.routine.findFirst({
    where: { id, ...ownerWhere(userId) },
    select: { id: true },
  });
  if (!existing) throw new Error("Routine not found");

  await prisma.routine.delete({ where: { id } });
  revalidatePath("/routines");
  revalidatePath("/today");
}
