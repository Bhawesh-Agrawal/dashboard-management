"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getNow } from "@/lib/clock";
import { assertDsaTopicOwner, requireDsaUserId } from "./ownership";
import { DsaTopicStatusSchema } from "./schemas";
import { dsaParseDate, dsaToday, DSA_DEFAULT_TIMEZONE } from "./time";

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

  const todayDate = dsaParseDate(dsaToday(getNow(), DSA_DEFAULT_TIMEZONE));

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
