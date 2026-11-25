"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertDsaProblemOwner, requireDsaUserId } from "./ownership";
import { DateOnlyStringSchema } from "./schemas";
import { dsaParseDate } from "./time";

const SetManualRevisionDateSchema = z.object({
  problemId: z.string().uuid(),
  manualNextRevisionDate: DateOnlyStringSchema.nullable(),
});

/**
 * Sets or clears a manual next-revision date override on a DsaProblem.
 * Overridden automatically whenever a newer attempt is logged.
 */
export async function setManualRevisionDate(
  input: z.infer<typeof SetManualRevisionDateSchema>
) {
  const validated = SetManualRevisionDateSchema.parse(input);
  const userId = await requireDsaUserId();
  await assertDsaProblemOwner(userId, validated.problemId);

  const dateVal = validated.manualNextRevisionDate
    ? dsaParseDate(validated.manualNextRevisionDate)
    : null;

  await prisma.dsaProblem.update({
    where: { id: validated.problemId },
    data: { manualNextRevisionDate: dateVal },
  });

  revalidatePath("/dsa");
  revalidatePath("/dsa/problems");
  revalidatePath(`/dsa/problems/${validated.problemId}`);
  revalidatePath("/dsa/revision");
  revalidatePath("/dsa/topics");

  return {
    ok: true,
    manualNextRevisionDate: validated.manualNextRevisionDate,
  };
}
