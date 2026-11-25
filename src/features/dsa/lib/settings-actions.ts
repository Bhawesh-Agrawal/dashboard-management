"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireDsaUserId, assertDsaTopicOwner } from "./ownership";
import { DsaSettingsInputSchema } from "./schemas";
import { dsaParseDate } from "./time";
import type { z } from "zod";

/**
 * Creates or updates DsaSettings (programmeStartDate, length, phases, currentTopicId).
 */
export async function saveDsaSettings(
  input: z.infer<typeof DsaSettingsInputSchema>
) {
  const validated = DsaSettingsInputSchema.parse(input);
  const userId = await requireDsaUserId();

  if (validated.currentTopicId) {
    await assertDsaTopicOwner(userId, validated.currentTopicId);
  }

  const startDate = dsaParseDate(validated.programmeStartDate);
  const sortedPhases = [...validated.phases].sort((a, b) => a.startDay - b.startDay);

  const settings = await prisma.dsaSettings.upsert({
    where: { userId },
    update: {
      programmeStartDate: startDate,
      programmeLengthDays: validated.programmeLengthDays,
      phases: sortedPhases,
      ...(validated.currentTopicId !== undefined
        ? { currentTopicId: validated.currentTopicId }
        : {}),
    },
    create: {
      userId,
      programmeStartDate: startDate,
      programmeLengthDays: validated.programmeLengthDays,
      phases: sortedPhases,
      currentTopicId: validated.currentTopicId ?? null,
    },
  });

  revalidatePath("/dsa");
  revalidatePath("/dsa/settings");
  revalidatePath("/dsa/report");
  revalidatePath("/today");

  return { ok: true, settings };
}
