"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getNow } from "@/lib/clock";
import { assertDsaTopicOwner, requireDsaUserId } from "./ownership";
import { DsaTopicStatusSchema } from "./schemas";
import { getUserTimezone } from "@/lib/timezone-server";
import { dsaParseDate, dsaToday } from "./time";

const UpdateTopicStatusSchema = z.object({
  topicId: z.string().uuid(),
  status: DsaTopicStatusSchema,
});

const SetCurrentTopicSchema = z.object({
  topicId: z.string().uuid(),
});

/**
 * Manually updates a topic's status. Any valid DsaTopicStatus is allowed.
 */
export async function updateDsaTopicStatus(
  input: z.infer<typeof UpdateTopicStatusSchema>
) {
  const validated = UpdateTopicStatusSchema.parse(input);
  const userId = await requireDsaUserId();
  await assertDsaTopicOwner(userId, validated.topicId);

  const updated = await prisma.dsaTopic.update({
    where: { id: validated.topicId },
    data: { status: validated.status },
  });

  revalidatePath("/dsa");
  revalidatePath("/dsa/topics");
  revalidatePath("/dsa/report");

  return { ok: true, topic: updated };
}

/**
 * Marks a topic as the owner's current topic in DsaSettings.
 */
export async function setDsaCurrentTopic(
  input: z.infer<typeof SetCurrentTopicSchema>
) {
  const validated = SetCurrentTopicSchema.parse(input);
  const userId = await requireDsaUserId();
  await assertDsaTopicOwner(userId, validated.topicId);

  const tz = await getUserTimezone();
  const todayDate = dsaParseDate(dsaToday(getNow(), tz));

  await prisma.dsaSettings.upsert({
    where: { userId },
    update: { currentTopicId: validated.topicId },
    create: {
      userId,
      programmeStartDate: todayDate,
      programmeLengthDays: 90,
      phases: [],
      currentTopicId: validated.topicId,
    },
  });

  revalidatePath("/dsa");
  revalidatePath("/dsa/topics");
  revalidatePath("/dsa/problems");
  revalidatePath("/dsa/report");

  return { ok: true, currentTopicId: validated.topicId };
}

const SetTodayProblemsSchema = z.object({
  problemIds: z.array(z.string().uuid()).max(10),
});

/**
 * Persists the owner's manually selected problems for "What to study today".
 * Passing an empty array resets to automatic selection.
 */
export async function setDsaTodayProblems(
  input: z.infer<typeof SetTodayProblemsSchema>
) {
  const validated = SetTodayProblemsSchema.parse(input);
  const userId = await requireDsaUserId();
  const uniqueIds = Array.from(new Set(validated.problemIds));

  if (uniqueIds.length > 0) {
    const ownedCount = await prisma.dsaProblem.count({
      where: { userId, id: { in: uniqueIds }, archived: false },
    });
    if (ownedCount !== uniqueIds.length) {
      throw new Error("One or more selected problems were not found");
    }
  }

  const tz = await getUserTimezone();
  const todayDate = dsaParseDate(dsaToday(getNow(), tz));

  await prisma.dsaSettings.upsert({
    where: { userId },
    update: { todayProblemIds: uniqueIds },
    create: {
      userId,
      programmeStartDate: todayDate,
      programmeLengthDays: 90,
      phases: [],
      todayProblemIds: uniqueIds,
    },
  });

  revalidatePath("/dsa");
  return { ok: true, todayProblemIds: uniqueIds };
}
