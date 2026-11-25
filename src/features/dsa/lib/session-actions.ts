"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireDsaUserId } from "./ownership";
import { DsaSessionInputSchema } from "./schemas";
import { dsaParseDate } from "./time";
import type { z } from "zod";

function cleanOpt(val: string | null | undefined): string | null {
  if (val == null) return null;
  const trimmed = val.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Creates or updates a DsaSession for a given date.
 * Works both to close a day with attempts and to record a session with 0 attempts (e.g. lectures only).
 */
export async function upsertDsaSession(
  input: z.infer<typeof DsaSessionInputSchema>
) {
  const validated = DsaSessionInputSchema.parse(input);
  const userId = await requireDsaUserId();
  const dateObj = dsaParseDate(validated.date);

  const session = await prisma.dsaSession.upsert({
    where: {
      userId_date: {
        userId,
        date: dateObj,
      },
    },
    update: {
      durationMin: validated.durationMin ?? null,
      observations: cleanOpt(validated.observations),
      nextSessionAvailabilityMin: validated.nextSessionAvailabilityMin ?? null,
      nextSessionNote: cleanOpt(validated.nextSessionNote),
    },
    create: {
      userId,
      date: dateObj,
      durationMin: validated.durationMin ?? null,
      observations: cleanOpt(validated.observations),
      nextSessionAvailabilityMin: validated.nextSessionAvailabilityMin ?? null,
      nextSessionNote: cleanOpt(validated.nextSessionNote),
    },
  });

  revalidatePath("/dsa");
  revalidatePath("/dsa/log");
  revalidatePath("/dsa/report");

  return { ok: true, session };
}
