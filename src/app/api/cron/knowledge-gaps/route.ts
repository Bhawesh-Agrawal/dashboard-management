import { NextResponse } from "next/server";
import {
  precomputeKnowledgeGaps,
  detectKnowledgeGaps,
} from "@/features/notes/lib/knowledge-gaps";
import { verifyCronRequest } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * Knowledge gap pre-computation cron endpoint.
 * Runs graph analysis to detect orphan notes, sparse areas,
 * and missing connections. Stores results for dashboard consumption.
 * Protected by fail-closed cron authentication.
 */
export async function GET(request: Request) {
  const isAuthorized = await verifyCronRequest(request);
  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { prisma } = await import("@/lib/prisma");
    // Find all distinct users that have created notes
    const activeUsers = await prisma.note.findMany({
      where: { userId: { not: null } },
      distinct: ["userId"],
      select: { userId: true },
    });

    const userIds = activeUsers.map((u) => u.userId as string);
    if (userIds.length === 0) {
      return NextResponse.json({ ok: true, message: "No active users found" });
    }

    const results = [];

    for (const userId of userIds) {
      // Run stats computation and detailed gap detection in parallel
      const [stats, gaps] = await Promise.all([
        precomputeKnowledgeGaps(userId),
        detectKnowledgeGaps(userId),
      ]);
      
      results.push({
        userId,
        stats: stats.gaps,
        gaps: gaps.map((g) => ({
          type: g.type,
          description: g.description,
          severity: g.severity,
          relatedNoteCount: g.relatedNoteIds.length,
        })),
        gapCount: gaps.length,
        computedAt: stats.computedAt.toISOString(),
      });
    }

    return NextResponse.json({
      ok: true,
      processedUsers: results.length,
      results,
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
