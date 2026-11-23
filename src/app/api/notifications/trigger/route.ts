import { NextResponse } from "next/server";
import { runNotificationScheduler } from "@/features/notifications/lib/scheduler";
import { verifyCronRequest } from "@/lib/cron-auth";
import { getNow, isProductionEnv, setSimulatedTime, resetClock } from "@/lib/clock";

/**
 * Notification scheduler trigger endpoint.
 * Protected by fail-closed cron authentication (Google Cloud Scheduler OIDC or static bearer token).
 * Query parameter secret (?secret=...) is rejected.
 *
 * Accepts ?asOf=ISO_TIMESTAMP to simulate time in non-production environments only.
 * In production, asOf is ignored and rejected with HTTP 400.
 */
export async function GET(request: Request) {
  const isAuthorized = await verifyCronRequest(request);
  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const asOf = url.searchParams.get("asOf");

  if (asOf !== null) {
    if (isProductionEnv()) {
      return NextResponse.json(
        { error: "asOf parameter is not permitted in production" },
        { status: 400 }
      );
    }
    const parsed = new Date(asOf);
    if (isNaN(parsed.getTime())) {
      return NextResponse.json(
        { error: "Invalid asOf timestamp: must be a valid ISO-8601 string" },
        { status: 400 }
      );
    }
    setSimulatedTime(parsed);
  }

  try {
    const force = url.searchParams.get("force") === "true";
    await runNotificationScheduler(force);
    return NextResponse.json({ ok: true, timestamp: getNow().toISOString() });
  } catch (error) {
    console.error("Notification scheduler error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  } finally {
    if (asOf !== null && !isProductionEnv()) {
      resetClock();
    }
  }
}
