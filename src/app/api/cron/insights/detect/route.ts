import { NextResponse } from "next/server";
import { generateAllInsights } from "@/features/insights/lib/detection";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * Cron trigger for the Ignored Insights detection engine.
 *
 * Hit this via an external cron service (e.g. every 6 hours):
 *   GET /api/cron/insights/detect?secret=YOUR_CRON_SECRET
 *
 * Supports both query parameter and Authorization header for authentication.
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
    const insights = await generateAllInsights("default-user");
    return NextResponse.json({
      ok: true,
      count: insights.length,
      insights,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Insight detection cron failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
