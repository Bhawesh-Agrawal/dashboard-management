import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * Consolidated daily diagnostics cron endpoint.
 * Calls insights, knowledge-gaps, and reviews endpoints sequentially.
 *
 * External cron schedule: 0 7 * * * (daily at 7:00 AM UTC / 12:30 PM IST)
 * GET /api/cron/daily-diagnostics?secret=YOUR_CRON_SECRET
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

  const baseUrl = url.origin;
  const results: Record<string, unknown> = {};

  const endpoints = [
    { name: "insights", path: "/api/cron/insights" },
    { name: "knowledge-gaps", path: "/api/cron/knowledge-gaps" },
    { name: "reviews", path: "/api/cron/reviews" },
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(`${baseUrl}${endpoint.path}?secret=${cronSecret}`);
      results[endpoint.name] = await res.json();
    } catch (err) {
      results[endpoint.name] = {
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  return NextResponse.json({
    ok: true,
    results,
    timestamp: new Date().toISOString(),
  });
}
