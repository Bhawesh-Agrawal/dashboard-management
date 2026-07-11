"use server";

import { completeRoutine, uncompleteRoutine } from "@/features/routines/lib/completions";
import { revalidatePath } from "next/cache";

/**
 * Mark a routine as completed for today.
 * Server action that can be called from client components.
 */
export async function completeRoutineAction(
  routineId: string
): Promise<{ success: boolean }> {
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
