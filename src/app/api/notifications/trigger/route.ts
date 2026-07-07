import { NextResponse } from "next/server";
import { runNotificationScheduler } from "@/features/notifications/lib/scheduler";

/**
 * Notification scheduler trigger endpoint.
 * Hit this via an external cron service every 5 minutes:
 *   GET /api/notifications/trigger?secret=YOUR_CRON_SECRET
 *
 * Supports both query parameter and Authorization header for authentication.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const secretParam = url.searchParams.get("secret");
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && secretParam !== cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await runNotificationScheduler();
    return NextResponse.json({ ok: true, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error("Notification scheduler error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
