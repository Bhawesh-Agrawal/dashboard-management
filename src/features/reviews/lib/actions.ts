"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { ReviewType } from "@prisma/client";
import { generateReview } from "./generator";

export async function getReviews(
  userId: string,
  type?: ReviewType,
  limit = 10
) {
  return prisma.review.findMany({
    where: {
      userId,
      ...(type ? { type } : {}),
    },
    orderBy: { periodEnd: "desc" },
    take: limit,
  });
}

export async function getReviewById(id: string) {
  return prisma.review.findUnique({ where: { id } });
}

export async function getLatestReview(userId: string, type: ReviewType) {
  return prisma.review.findFirst({
    where: { userId, type },
    orderBy: { periodEnd: "desc" },
  });
}

export async function markReviewViewed(id: string) {
  const review = await prisma.review.update({
    where: { id },
    data: { status: "viewed", viewedAt: new Date() },
  });
  revalidatePath("/reviews");
  return review;
}

export async function archiveReview(id: string) {
  const review = await prisma.review.update({
    where: { id },
    data: { status: "archived" },
  });
  revalidatePath("/reviews");
  return review;
}

export async function generateReviewAction(type: ReviewType) {
  try {
    const result = await generateReview("default-user", type, new Date());
    revalidatePath("/reviews");
    return { ok: true as const, review: result };
  } catch (err) {
    console.error(`generateReviewAction(${type}) failed:`, err);
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
