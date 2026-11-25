"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertDsaContestOwner, requireDsaUserId } from "./ownership";
import { DsaContestInputSchema } from "./schemas";
import { dsaParseDate } from "./time";

const ValidatedContestSchema = DsaContestInputSchema.refine(
  (d) => d.problemsSolved <= d.problemsAttempted,
  { message: "Problems solved cannot exceed problems attempted." }
);

const UpdateContestSchema = ValidatedContestSchema.extend({
  id: z.string().uuid(),
});

const DeleteContestSchema = z.object({
  id: z.string().uuid(),
});

function cleanOpt(val: string | null | undefined): string | null {
  if (val == null) return null;
  const trimmed = val.trim();
  return trimmed === "" ? null : trimmed;
}

function revalidateContestPaths() {
  revalidatePath("/dsa/contests");
  revalidatePath("/dsa/report");
}

export async function createDsaContest(
  input: z.infer<typeof DsaContestInputSchema>
) {
  const validated = ValidatedContestSchema.parse(input);
  const userId = await requireDsaUserId();

  const contest = await prisma.dsaContest.create({
    data: {
      userId,
      platform: validated.platform,
      name: validated.name,
      date: dsaParseDate(validated.date),
      problemsAttempted: validated.problemsAttempted,
      problemsSolved: validated.problemsSolved,
      rankOrRating: cleanOpt(validated.rankOrRating),
      upsolveProblems: cleanOpt(validated.upsolveProblems),
      conceptsMissed: cleanOpt(validated.conceptsMissed),
    },
  });

  revalidateContestPaths();
  return { ok: true, contest };
}

export async function updateDsaContest(
  input: z.infer<typeof UpdateContestSchema>
) {
  const validated = UpdateContestSchema.parse(input);
  const userId = await requireDsaUserId();
  await assertDsaContestOwner(userId, validated.id);

  const contest = await prisma.dsaContest.update({
    where: { id: validated.id },
    data: {
      platform: validated.platform,
      name: validated.name,
      date: dsaParseDate(validated.date),
      problemsAttempted: validated.problemsAttempted,
      problemsSolved: validated.problemsSolved,
      rankOrRating: cleanOpt(validated.rankOrRating),
      upsolveProblems: cleanOpt(validated.upsolveProblems),
      conceptsMissed: cleanOpt(validated.conceptsMissed),
    },
  });

  revalidateContestPaths();
  return { ok: true, contest };
}

export async function deleteDsaContest(
  input: z.infer<typeof DeleteContestSchema>
) {
  const validated = DeleteContestSchema.parse(input);
  const userId = await requireDsaUserId();
  await assertDsaContestOwner(userId, validated.id);

  await prisma.dsaContest.delete({ where: { id: validated.id } });
  revalidateContestPaths();
  return { ok: true };
}
