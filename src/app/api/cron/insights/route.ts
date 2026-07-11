import { generateAllInsights } from "@/features/insights/lib/detection";
import {
  generateAIInsights,
  combineInsights,
} from "@/features/insights/lib/ai-insights";
import { generateReview } from "@/features/reviews/lib/generator";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * Combined insights + daily review cron endpoint.
 * Runs rule-based detection, AI-powered generation, merges results,
 * and generates a daily morning brief review.
 *
 * External cron schedule: 0 7 * * * (daily at 7:00 AM UTC)
 * GET /api/cron/insights?secret=YOUR_CRON_SECRET
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

  try {
    // Run insights and daily review in parallel
    const [ruleBased, aiBased, dailyReview] = await Promise.all([
      generateAllInsights("default-user"),
      generateAIInsights("default-user"),
      generateReview("default-user", "daily", new Date()),
    ]);

    const combined = combineInsights(ruleBased, aiBased);

    return NextResponse.json({
      ok: true,
      insights: combined,
      insightCount: combined.length,
      dailyReview: {
        id: dailyReview.id,
        summary: dailyReview.summary.slice(0, 200),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Insights cron failed:", err);
    return NextResponse.json(
      { ok: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
