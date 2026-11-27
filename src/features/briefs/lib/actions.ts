"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/auth";
import { getNow } from "@/lib/clock";
import { getUserTimezone } from "@/lib/timezone-server";
import { generateAndPersistBrief } from "./generate";
import { getDailyBriefByDate } from "./storage";
import type { BriefKindV2, BriefPayloadV2 } from "./payload-v2";

const REGENERATE_COOLDOWN_MS = 60 * 1000;

export async function regenerateBriefAction(
  kind: BriefKindV2
): Promise<{
  success: boolean;
  payload?: BriefPayloadV2;
  error?: string;
  cooldownRemainingSec?: number;
}> {
  try {
    const userId = await getCurrentUserId();
    const timezone = await getUserTimezone();
    const now = getNow();

    if (kind === "morning" || kind === "evening") {
      const todayStr = now.toISOString().slice(0, 10);
      const existing = await getDailyBriefByDate(userId, kind, todayStr).catch(
        () => null
      );
      if (existing) {
        const elapsed = now.getTime() - existing.generatedAt.getTime();
        if (elapsed >= 0 && elapsed < REGENERATE_COOLDOWN_MS) {
          const remaining = Math.ceil((REGENERATE_COOLDOWN_MS - elapsed) / 1000);
          return {
            success: false,
            error: `Please wait ${remaining}s before regenerating.`,
            cooldownRemainingSec: remaining,
          };
        }
      }
    }

    const payload = await generateAndPersistBrief({
      userId,
      kind,
      now,
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
