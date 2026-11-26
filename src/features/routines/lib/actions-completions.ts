"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { ownerWhere } from "@/lib/owner-scoping";
import { completeRoutine, uncompleteRoutine } from "@/features/routines/lib/completions";
import { revalidatePath } from "next/cache";

/**
 * Mark a routine as completed for today.
 * Server action that can be called from client components.
 */
export async function completeRoutineAction(
  routineId: string
): Promise<{ success: boolean }> {
  const userId = await getCurrentUserId();
  const routine = await prisma.routine.findFirst({
    where: { id: routineId, ...ownerWhere(userId) },
    select: { id: true },
  });
  if (!routine) throw new Error("Routine not found");

  try {
    await completeRoutine(routineId);
    revalidatePath("/routines");
    revalidatePath("/today");
    return { success: true };
  } catch (error) {
    console.error("Failed to complete routine:", error);
    return { success: false };
  }
}

/**
 * Remove a routine completion for today (undo).
 * Server action that can be called from client components.
 */
export async function uncompleteRoutineAction(
  routineId: string
): Promise<{ success: boolean }> {
  const userId = await getCurrentUserId();
  const routine = await prisma.routine.findFirst({
    where: { id: routineId, ...ownerWhere(userId) },
    select: { id: true },
  });
  if (!routine) throw new Error("Routine not found");

  try {
    await uncompleteRoutine(routineId);
    revalidatePath("/routines");
    revalidatePath("/today");
    return { success: true };
  } catch (error) {
    console.error("Failed to uncomplete routine:", error);
    return { success: false };
  }
}
