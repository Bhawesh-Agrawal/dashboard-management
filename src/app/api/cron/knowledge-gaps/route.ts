import { NextResponse } from "next/server";
import {
  precomputeKnowledgeGaps,
  detectKnowledgeGaps,
} from "@/features/notes/lib/knowledge-gaps";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * Knowledge gap pre-computation cron endpoint.
 * Runs graph analysis to detect orphan notes, sparse areas,
 * and missing connections. Stores results for dashboard consumption.
 *
 * External cron schedule: 0 3 * * * (daily at 3:00 AM UTC)
 * GET /api/cron/knowledge-gaps?secret=YOUR_CRON_SECRET
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
    const userId = "default-user";

    // Run stats computation and detailed gap detection in parallel
    const [stats, gaps] = await Promise.all([
      precomputeKnowledgeGaps(userId),
      detectKnowledgeGaps(userId),
    ]);

    return NextResponse.json({
      ok: true,
      stats: stats.gaps,
      gaps: gaps.map((g) => ({
        type: g.type,
        description: g.description,
        severity: g.severity,
        relatedNoteCount: g.relatedNoteIds.length,
      })),
      gapCount: gaps.length,
      computedAt: stats.computedAt.toISOString(),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Knowledge gaps cron failed:", err);
    return NextResponse.json(
      { ok: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
