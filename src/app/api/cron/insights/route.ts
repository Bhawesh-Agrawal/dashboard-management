import { generateAllInsights } from "@/features/insights/lib/detection";
import {
  generateAIInsights,
  combineInsights,
} from "@/features/insights/lib/ai-insights";
import { generateReview } from "@/features/reviews/lib/generator";
import { NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { getNow } from "@/lib/clock";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * Combined insights + daily review cron endpoint.
 * Runs rule-based detection, AI-powered generation, merges results,
 * and generates a daily morning brief review.
 * Protected by fail-closed cron authentication.
 */
export async function GET(request: Request) {
  const isAuthorized = await verifyCronRequest(request);
  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { prisma } = await import("@/lib/prisma");
    // Find all distinct users that have created tasks
    const activeUsers = await prisma.task.findMany({
      where: { userId: { not: null } },
      distinct: ["userId"],
      select: { userId: true },
    });

    const userIds = activeUsers.map((u) => u.userId as string);
    if (userIds.length === 0) {
      return NextResponse.json({ ok: true, message: "No active users found" });
    }

    const results = [];

    // Process all users sequentially or in parallel depending on scale
    // Doing it sequentially here to avoid blasting the DB/AI API
    for (const userId of userIds) {
      // Look up user's timezone for correct local day calculation
      let timezone: string | null = null;
      try {
        const pref = await prisma.notificationPreference.findFirst({
          where: { userId, timezone: { not: null } },
          select: { timezone: true },
        });
        timezone = pref?.timezone || null;
      } catch {
        // No timezone set — use default
      }

      const [ruleBased, aiBased, dailyReview] = await Promise.all([
        generateAllInsights(userId),
        generateAIInsights(userId),
        generateReview(userId, "daily", getNow(), { timezone: timezone || undefined }),
      ]);

      const combined = combineInsights(ruleBased, aiBased);
      results.push({
        userId,
        insightCount: combined.length,
        dailyReviewId: dailyReview.id,
      });
    }

    return NextResponse.json({
      ok: true,
      processedUsers: results.length,
      results,
      timestamp: getNow().toISOString(),
    });
  } catch (err) {
    console.error("Insights cron failed:", err);
    return NextResponse.json(
      { ok: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
