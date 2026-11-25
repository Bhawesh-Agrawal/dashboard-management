import { NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { getNow } from "@/lib/clock";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * Consolidated daily diagnostics cron endpoint.
 * Runs log & sent-notification cleanup (weekly reviews are generated exclusively by /api/cron/reviews).
 * Protected by fail-closed cron authentication (Google Cloud Scheduler OIDC or static bearer token).
 */
export async function GET(request: Request) {
  const isAuthorized = await verifyCronRequest(request);
  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, unknown> = {};

  // Log & sent-notification cleanup (delete entries older than 7 days)
  try {
    const cutoff = getNow();
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
    results["cleanup"] = {
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }

  return NextResponse.json({
    ok: true,
    results,
    timestamp: getNow().toISOString(),
  });
}
