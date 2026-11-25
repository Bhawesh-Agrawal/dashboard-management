import { NextResponse } from "next/server";
import type { ReviewType } from "@prisma/client";
import { verifyCronRequest } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { getNow } from "@/lib/clock";
import { generateReview } from "@/features/reviews/lib/generator";

export const runtime = "nodejs";
export const revalidate = 0;

function isLastDayOfMonth(date: Date): boolean {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.getUTCMonth() !== date.getUTCMonth();
}

function isQuarterEnd(date: Date): boolean {
  const month = date.getUTCMonth();
  return [2, 5, 8, 11].includes(month) && isLastDayOfMonth(date);
}

/**
 * Consolidated daily diagnostics & maintenance cron endpoint.
 * Single route responsible for periodic review generation (weekly, monthly, quarterly)
 * and log/sent-notification cleanup.
 * Scheduled via Cloud Scheduler job `daily-maintenance` (02:00 Asia/Kathmandu).
 * Protected by fail-closed cron authentication (Google Cloud Scheduler OIDC or static bearer token).
 */
export async function GET(request: Request) {
  const isAuthorized = await verifyCronRequest(request);
  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = getNow();
  const results: Record<string, unknown> = {};

  // 1. Review generation (Weekly on Sunday, Monthly on last day of month, Quarterly on quarter end)
  const reviewTypes: ReviewType[] = [];
  if (now.getUTCDay() === 0) {
    reviewTypes.push("weekly");
  }
  if (isLastDayOfMonth(now)) {
    reviewTypes.push("monthly");
  }
  if (isQuarterEnd(now)) {
    reviewTypes.push("quarterly");
  }

  if (reviewTypes.length > 0) {
    try {
      const activeUsers = await prisma.task.findMany({
        where: { userId: { not: null } },
        distinct: ["userId"],
        select: { userId: true },
      });

      const userIds = activeUsers.map((u) => u.userId as string);
      const generated = [];

      for (const userId of userIds) {
        for (const type of reviewTypes) {
          const review = await generateReview(userId, type, now);
          generated.push({
            userId,
            reviewId: review.id,
            type: review.type,
            periodStart: review.periodStart.toISOString(),
            periodEnd: review.periodEnd.toISOString(),
          });
        }
      }

      results["reviews"] = {
        ok: true,
        types: reviewTypes,
        count: generated.length,
        reviews: generated,
      };
    } catch (err) {
      console.error("[DailyDiagnostics] Review generation failed:", err);
      results["reviews"] = {
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  } else {
    results["reviews"] = {
      skipped: true,
      reason: "No reviews scheduled for today (weekly: Sunday, monthly: month-end, quarterly: quarter-end)",
    };
  }

  // 2. Log & sent-notification cleanup (delete entries older than 7 days)
  try {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 7);
    const cleaned = await prisma.sentNotification.deleteMany({
      where: { sentAt: { lt: cutoff } },
    });
    results["cleanup"] = {
      ok: true,
      deletedSentNotifications: cleaned.count,
      cutoff: cutoff.toISOString(),
    };
  } catch (err) {
    console.error("[DailyDiagnostics] Notification cleanup failed:", err);
    results["cleanup"] = {
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }

  return NextResponse.json({
    ok: true,
    results,
    timestamp: now.toISOString(),
  });
}
