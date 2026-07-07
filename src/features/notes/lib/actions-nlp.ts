"use server";

import { parseQuickCapture, getActiveCourses } from "@/features/notes/lib/nlp-parsing";
import type { ParsedCapture } from "@/features/notes/lib/nlp-parsing";

/**
 * Parse freeform text into structured Task or Note data.
 * Server action that can be called from client components.
 */
export async function parseQuickCaptureAction(
  input: string
): Promise<ParsedCapture> {
  const courses = await getActiveCourses();
  return parseQuickCapture(input, courses);
}

/**
 * Get available courses for the active semester.
 * Server action that can be called from client components.
 */
export async function getActiveCoursesAction(): Promise<
  { id: string; name: string; code: string | null }[]
> {
  return getActiveCourses();
}
