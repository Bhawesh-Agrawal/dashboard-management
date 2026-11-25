"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/auth";
import { getNow } from "@/lib/clock";
import { getUserTimezone } from "@/lib/timezone-server";
import { generateAndPersistBrief } from "./generate";
import type { BriefPayload } from "./build";

export async function regenerateBriefAction(
  kind: "morning" | "evening"
): Promise<{ success: boolean; payload?: BriefPayload; error?: string }> {
  try {
    const userId = await getCurrentUserId();
    const timezone = await getUserTimezone();
    const payload = await generateAndPersistBrief({
      userId,
      kind,
      now: getNow(),
      timezone,
    });
    revalidatePath("/brief");
    revalidatePath("/today");
    return { success: true, payload };
  } catch (error) {
    console.error("Failed to regenerate brief:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to regenerate brief",
    };
  }
}
