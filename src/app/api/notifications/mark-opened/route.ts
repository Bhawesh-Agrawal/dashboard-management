import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/notifications/mark-opened
 * Records that a user clicked/opened a notification (for weekly stats).
 * Body: { tag: string }
 * Uses a cookie-based or header-based user ID for auth.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tag } = body;

    if (!tag || typeof tag !== "string") {
      return NextResponse.json({ error: "tag is required" }, { status: 400 });
    }

    // Extract userId from the authenticated session
    // The service worker sends this from the push payload's data
    const userId = request.headers.get("x-user-id");

    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    await prisma.sentNotification.updateMany({
      where: { userId, tag },
      data: { openedAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch {
    // Non-critical — don't fail the click handler
    return NextResponse.json({ ok: true });
  }
}
