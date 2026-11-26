import { NextResponse } from "next/server";
import {
  DEFAULT_ENABLED_TYPES,
  runNotificationScheduler,
  type NotificationType,
} from "@/features/notifications/lib/scheduler";
import { verifyCronRequest } from "@/lib/cron-auth";
import { getNow, isProductionEnv, withSimulatedTime } from "@/lib/clock";

const VALID_TYPES = new Set<string>(DEFAULT_ENABLED_TYPES);

/**
 * Notification scheduler trigger endpoint.
 * Protected by fail-closed cron authentication (Google Cloud Scheduler OIDC or static bearer token).
 * Query parameter secret (?secret=...) is rejected.
 *
 * Accepts ?asOf=ISO_TIMESTAMP and ?only=<type> in non-production environments only.
 * In production, asOf and only are rejected with HTTP 400.
 */
export async function GET(request: Request) {
  const isAuthorized = await verifyCronRequest(request);
  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const asOf = url.searchParams.get("asOf");
  const only = url.searchParams.get("only");

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
  }

  if (only !== null) {
    if (isProductionEnv()) {
      return NextResponse.json(
        { error: "only parameter is not permitted in production" },
        { status: 400 }
      );
    }
    if (!VALID_TYPES.has(only)) {
      return NextResponse.json(
        { error: `Invalid only notification type: ${only}` },
        { status: 400 }
      );
    }
  }

  const force = url.searchParams.get("force") === "true";

  const executeHandler = async () => {
    const startedAt = Date.now();
    try {
      const result = only
        ? await runNotificationScheduler(force, { only: only as NotificationType })
        : await runNotificationScheduler(force);
      const durationMs = Date.now() - startedAt;
      console.log(
        JSON.stringify({
          event: "notifications_trigger",
          ok: true,
          only: only ?? "all",
          durationMs,
          counts: {
            sent: result.sent,
            deliveredPushes: result.deliveredPushes,
            skippedDedup: result.skippedDedup,
            skippedDisabled: result.skippedDisabled,
            skippedQuietHours: result.skippedQuietHours,
            skippedNoSubscription: result.skippedNoSubscription,
            removedSubscriptions: result.removedSubscriptions,
          },
          errorCount: result.failed,
        })
      );
      return NextResponse.json({
        ok: true,
        timestamp: getNow().toISOString(),
        only: only ?? null,
        result,
      });
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      console.log(
        JSON.stringify({
          event: "notifications_trigger",
          ok: false,
          only: only ?? "all",
          durationMs,
          counts: {},
          errorCount: 1,
        })
      );
      console.error("Notification scheduler error:", error);
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
        { status: 500 }
      );
    }
  };

  if (asOf !== null) {
    return withSimulatedTime(asOf, executeHandler);
  }

  return executeHandler();
}
