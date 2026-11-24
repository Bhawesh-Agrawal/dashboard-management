import { NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { getNow } from "@/lib/clock";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * Consolidated daily diagnostics cron endpoint.
 * Runs weekly review generation and log/sent-notification cleanup.
 * Protected by fail-closed cron authentication (Google Cloud Scheduler OIDC or static bearer token).
 */
export async function GET(request: Request) {
  const isAuthorized = await verifyCronRequest(request);
  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const baseUrl = url.origin;
  const authHeader = request.headers.get("authorization");
  const results: Record<string, unknown> = {};

  // 1. Weekly review generation via reviews cron
  try {
    const res = await fetch(`${baseUrl}/api/cron/reviews`, {
      headers: authHeader ? { Authorization: authHeader } : {},
    });
    results["reviews"] = await res.json();
  } catch (err) {
    results["reviews"] = {
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }

  // 2. Log & sent-notification cleanup (delete entries older than 7 days)
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
