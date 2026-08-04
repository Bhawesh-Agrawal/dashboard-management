import { generateReview } from "@/features/reviews/lib/generator";
import { NextResponse } from "next/server";
import type { ReviewType } from "@prisma/client";

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
 * Reviews cron endpoint.
 * Generates weekly, monthly, and quarterly reviews based on the current date.
 *
 * External cron schedule: 0 20 * * * (daily at 8:00 PM UTC)
 * The endpoint internally checks which reviews to generate:
 *   - Sunday → weekly review
 *   - Last day of month → monthly review
 *   - Last day of quarter (Mar/Jun/Sep/Dec) → quarterly review
 *   - Otherwise → no-op
 *
 * GET /api/cron/reviews?secret=YOUR_CRON_SECRET
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const secretParam = url.searchParams.get("secret");
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (
    cronSecret &&
    secretParam !== cronSecret &&
    authHeader !== `Bearer ${cronSecret}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0 = Sunday

  const reviewTypes: ReviewType[] = [];

  if (dayOfWeek === 0) {
    reviewTypes.push("weekly");
  }
  if (isLastDayOfMonth(now)) {
    reviewTypes.push("monthly");
  }
  if (isQuarterEnd(now)) {
    reviewTypes.push("quarterly");
  }

  if (reviewTypes.length === 0) {
    return NextResponse.json({
      ok: true,
      message: "No reviews scheduled for today",
      timestamp: now.toISOString(),
    });
  }

  try {
    const { prisma } = await import("@/lib/prisma");
    const activeUsers = await prisma.task.findMany({
      where: { userId: { not: null } },
      distinct: ["userId"],
      select: { userId: true },
    });

    const userIds = activeUsers.map((u) => u.userId as string);
    if (userIds.length === 0) {
      return NextResponse.json({ ok: true, message: "No active users found" });
    }

    const allResults = [];

    for (const userId of userIds) {
      const results = await Promise.all(
        reviewTypes.map((type) =>
          generateReview(userId, type, now)
        )
      );

      allResults.push({
        userId,
        reviews: results.map((r) => ({
          id: r.id,
          type: r.type,
          periodStart: r.periodStart.toISOString(),
          periodEnd: r.periodEnd.toISOString(),
          summary: r.summary.slice(0, 200),
        })),
      });
    }

    return NextResponse.json({
      ok: true,
      processedUsers: allResults.length,
      results: allResults,
      timestamp: now.toISOString(),
    });
  } catch (err) {
    console.error("Reviews cron failed:", err);
    return NextResponse.json(
      { ok: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
