"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createRoutine(data: {
  name: string;
  timeOfDay: "morning" | "afternoon" | "evening" | "anytime";
  specificTime?: string;
  streakGoal?: number;
  activeDays: ("MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN")[];
}) {
  const routine = await prisma.routine.create({ data });
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
  const routine = await prisma.routine.update({ where: { id }, data });
  revalidatePath("/routines");
  revalidatePath("/today");
  return routine;
}

export async function deleteRoutine(id: string) {
  await prisma.routine.delete({ where: { id } });
  revalidatePath("/routines");
  revalidatePath("/today");
}
