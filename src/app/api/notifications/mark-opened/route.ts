import { NextResponse } from "next/server";
import { getCurrentUserId, UnauthorizedError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNow } from "@/lib/clock";

/**
 * POST /api/notifications/mark-opened
 * Records that a user clicked/opened a notification (for weekly stats).
 * Body: { tag: string }
 * Authenticated via Supabase session cookie (same-origin request).
 */
export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();

    const body = await request.json();
    const { tag } = body;

    if (!tag || typeof tag !== "string") {
      return NextResponse.json({ error: "tag is required" }, { status: 400 });
    }

    await prisma.sentNotification.updateMany({
      where: { userId, tag },
      data: { openedAt: getNow() },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Non-critical — don't fail the click handler
    return NextResponse.json({ ok: true });
  }
}
