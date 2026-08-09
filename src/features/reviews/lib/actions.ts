"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { ReviewType } from "@prisma/client";
import type { Review } from "@prisma/client";
import { generateReview, isFallbackReview } from "./generator";
import type { ActionItem } from "./types";

// ─── Parse Prisma Json fields that may come back as strings ──
// @prisma/adapter-pg overrides pg's JSONB parser with a no-op,
// so Json columns can arrive as raw strings instead of objects.
function parseJson<T>(value: unknown): T {
  if (typeof value === "string") return JSON.parse(value) as T;
  return value as T;
}

function parseReviewJson(review: Review) {
  return {
    ...review,
    sections: parseJson(review.sections),
    actions: parseJson(review.actions),
    metrics: parseJson(review.metrics),
  };
}

export async function getReviews(
  userId: string,
  type?: ReviewType,
  limit = 20
) {
  const reviews = await prisma.review.findMany({
    where: {
      userId,
      status: { not: "archived" },
      ...(type ? { type } : {}),
    },
    orderBy: { periodEnd: "desc" },
    take: limit + 10,
  });

  return reviews
    .filter((r) => !isFallbackReview(r.summary))
    .slice(0, limit);
}

export async function getReviewById(id: string) {
  const review = await prisma.review.findUnique({ where: { id } });
  if (!review) return null;
  return parseReviewJson(review);
}

export async function getLatestReview(userId: string, type?: ReviewType) {
  const review = await prisma.review.findFirst({
    where: {
      userId,
      status: { not: "archived" },
      ...(type ? { type } : {}),
    },
    orderBy: { periodEnd: "desc" },
  });
  if (!review) return null;
  return parseReviewJson(review);
}

export async function getUnviewedCount(userId: string) {
  return prisma.review.count({
    where: {
      userId,
      status: "generated",
    },
  });
}

export async function markReviewViewed(id: string) {
  const review = await prisma.review.update({
    where: { id },
    data: { status: "viewed", viewedAt: new Date() },
  });
  after(() => {
    revalidatePath("/reviews");
  });
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

export async function deleteReview(id: string) {
  await prisma.review.delete({ where: { id } });
  revalidatePath("/reviews");
  return { ok: true as const };
}

export async function completeActionItem(
  reviewId: string,
  actionIndex: number
) {
  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review) throw new Error("Review not found");

  const actions = parseJson<ActionItem[]>(review.actions);
  const action = actions[actionIndex];
  if (!action) throw new Error("Action not found");

  const priorityMap = { high: 1, medium: 2, low: 3 };
  await prisma.task.create({
    data: {
      title: action.text,
      priority: priorityMap[action.priority] ?? 2,
      userId: review.userId,
      notes: `From ${review.type} review (${new Date(review.periodStart).toLocaleDateString()} – ${new Date(review.periodEnd).toLocaleDateString()})`,
    },
  });

  revalidatePath("/reviews");
  revalidatePath("/tasks");
  revalidatePath("/today");
  return { ok: true as const };
}

export async function exportReviewAsMarkdown(id: string) {
  const review = await prisma.review.findUnique({ where: { id } });
  if (!review) throw new Error("Review not found");

  const sections = parseJson<{ title: string; content: string }[]>(review.sections);
  const actions = parseJson<ActionItem[]>(review.actions);
  const metrics = parseJson<Record<string, unknown>>(review.metrics);

  const typeLabel = review.type.charAt(0).toUpperCase() + review.type.slice(1);
  const dateRange = `${new Date(review.periodStart).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(review.periodEnd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  let md = `# ${typeLabel} Review — ${dateRange}\n`;
  md += `*Generated ${new Date(review.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}*\n\n`;
  md += `## Executive Summary\n\n${review.summary}\n\n`;

  for (const section of sections) {
    md += `## ${section.title}\n\n${section.content}\n\n`;
  }

  if (actions.length > 0) {
    md += `---\n\n**Action Items**\n\n`;
    for (const action of actions) {
      md += `- [ ] ${action.text} *(${action.type}, ${action.priority})*\n`;
    }
    md += "\n";
  }

  md += `---\n\n**Metrics**\n\n`;
  if (typeof metrics.tasksCompleted === "number" && typeof metrics.tasksTotal === "number") {
    md += `- Tasks: ${metrics.tasksCompleted}/${metrics.tasksTotal} (${Math.round((metrics.completionRate as number) || 0)}%)\n`;
  }
  if (typeof metrics.routineAdherence === "number") {
    md += `- Routine Adherence: ${Math.round(metrics.routineAdherence)}%\n`;
  }
  if (typeof metrics.moodAverage === "number") {
    md += `- Mood Average: ${(metrics.moodAverage as number).toFixed(1)}/5\n`;
  }
  if (typeof metrics.totalSpent === "number") {
    md += `- Total Spent: $${(metrics.totalSpent as number).toFixed(2)}\n`;
  }
  if (typeof metrics.attendanceRate === "number") {
    md += `- Attendance: ${Math.round(metrics.attendanceRate as number)}%\n`;
  }
  if (typeof metrics.deepWorkHours === "number") {
    md += `- Deep Work: ${metrics.deepWorkHours}h\n`;
  }

  return md;
}

export async function generateReviewAction(type: ReviewType) {
  try {
    const result = await generateReview("default-user", type, new Date(), {
      replaceExisting: true,
    });
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
