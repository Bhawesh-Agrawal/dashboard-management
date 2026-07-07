import { NextResponse } from "next/server";
import { runNotificationScheduler } from "@/features/notifications/lib/scheduler";

/**
 * Vercel Cron endpoint for notification scheduler.
 * Runs every 5 minutes to check for due notifications.
 *
 * Security: Vercel Cron sends Authorization: Bearer <CRON_SECRET>.
 * For local dev, we skip the auth check.
 */
export async function GET(request: Request) {
  // Verify cron secret in production
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
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
