import { NextResponse } from "next/server";
import { runNotificationScheduler } from "@/features/notifications/lib/scheduler";
import { verifyCronRequest } from "@/lib/cron-auth";

/**
 * Notification scheduler trigger endpoint.
 * Protected by fail-closed cron authentication (Google Cloud Scheduler OIDC or static bearer token).
 * Query parameter secret (?secret=...) is rejected.
 */
export async function GET(request: Request) {
  const isAuthorized = await verifyCronRequest(request);
  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const force = url.searchParams.get("force") === "true";
    await runNotificationScheduler(force);
    return NextResponse.json({ ok: true, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error("Notification scheduler error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
