"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { ReviewType } from "@prisma/client";
import { generateReview } from "./generator";
import type { ActionItem } from "./types";

export async function getReviews(
  userId: string,
  type?: ReviewType,
  limit = 20
) {
  return prisma.review.findMany({
    where: {
      userId,
      status: { not: "archived" },
      ...(type ? { type } : {}),
    },
    orderBy: { periodEnd: "desc" },
    take: limit,
  });
}

export async function getReviewById(id: string) {
  return prisma.review.findUnique({ where: { id } });
}

export async function getLatestReview(userId: string, type?: ReviewType) {
  return prisma.review.findFirst({
    where: {
      userId,
      status: { not: "archived" },
      ...(type ? { type } : {}),
    },
    orderBy: { periodEnd: "desc" },
  });
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

export async function completeActionItem(
  reviewId: string,
  actionIndex: number
) {
  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review) throw new Error("Review not found");

  const actions = (review.actions as unknown as ActionItem[]) || [];
  const action = actions[actionIndex];
  if (!action) throw new Error("Action not found");

  const userId = review.userId;

  // Create a task from the action item
  const priorityMap = { high: 1, medium: 2, low: 3 };
  await prisma.task.create({
    data: {
      title: action.text,
      priority: priorityMap[action.priority] ?? 2,
      userId,
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

  const sections = (review.sections as unknown as { title: string; content: string }[]) || [];
  const actions = (review.actions as unknown as ActionItem[]) || [];
  const metrics = (review.metrics as unknown as Record<string, unknown>) || {};

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
    md += `- Mood Average: ${metrics.moodAverage.toFixed(1)}/5\n`;
  }
  if (typeof metrics.energyAverage === "number") {
    md += `- Energy Average: ${metrics.energyAverage.toFixed(1)}/5\n`;
  }
  if (typeof metrics.totalSpent === "number") {
    md += `- Total Spent: $${metrics.totalSpent.toFixed(2)}\n`;
  }
  if (typeof metrics.attendanceRate === "number") {
    md += `- Attendance: ${Math.round(metrics.attendanceRate)}%\n`;
  }
  if (typeof metrics.deepWorkHours === "number") {
    md += `- Deep Work: ${metrics.deepWorkHours}h\n`;
  }

  return md;
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
