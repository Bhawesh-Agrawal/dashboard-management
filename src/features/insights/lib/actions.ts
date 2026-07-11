"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { generateAllInsights } from "@/features/insights/lib/detection";

export async function getInsights(userId: string) {
  await generateAllInsights(userId);
  return prisma.ignoredInsight.findMany({
    where: {
      userId,
      actedOn: false,
      dismissedAt: null,
    },
    orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
    take: 5,
  });
}

export async function markInsightActedOn(id: string) {
  const insight = await prisma.ignoredInsight.update({
    where: { id },
    data: { actedOn: true },
  });
  revalidatePath("/today");
  return insight;
}

export async function dismissInsight(id: string) {
  const insight = await prisma.ignoredInsight.update({
    where: { id },
    data: { dismissedAt: new Date() },
  });
  revalidatePath("/today");
  return insight;
}
