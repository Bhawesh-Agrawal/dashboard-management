import { NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * Consolidated daily diagnostics cron endpoint.
 * Calls reviews endpoint.
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

  const endpoints = [
    { name: "reviews", path: "/api/cron/reviews" },
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(`${baseUrl}${endpoint.path}`, {
        headers: authHeader ? { Authorization: authHeader } : {},
      });
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
