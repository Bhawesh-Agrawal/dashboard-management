import { generateAllInsights } from "@/features/insights/lib/detection";
import {
  generateAIInsights,
  combineInsights,
} from "@/features/insights/lib/ai-insights";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * Combined insights cron endpoint.
 * Runs rule-based detection, AI-powered generation, and merges results.
 *
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
    // Run both pipelines in parallel
    const [ruleBased, aiBased] = await Promise.all([
      generateAllInsights("default-user"),
      generateAIInsights("default-user"),
    ]);

    const combined = combineInsights(ruleBased, aiBased);

    return NextResponse.json({
      ok: true,
      insights: combined,
      count: combined.length,
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
