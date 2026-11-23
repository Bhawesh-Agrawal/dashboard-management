import { NextResponse } from "next/server";
import { getCurrentUserId, UnauthorizedError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNowMs } from "@/lib/clock";

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();

    const body = await request.json();
    const { tag, duration } = body;

    if (!tag) {
      return NextResponse.json({ error: "Missing tag" }, { status: 400 });
    }

    // Default snooze duration: until class starts (or 30 minutes if not specified)
    // For class_start notifications, snooze until the class start time
    // For attendance notifications, snooze for 5 minutes to prevent re-triggering
    const snoozeDuration = duration || 30 * 60 * 1000; // 30 minutes default
    const snoozedUntil = new Date(getNowMs() + snoozeDuration);

    // Update or create the sent notification record with snooze time
    await prisma.sentNotification.upsert({
      where: { userId_tag: { userId, tag } },
      create: {
        userId,
        tag,
        type: "snooze",
        snoozedUntil,
      },
      update: {
        snoozedUntil,
      },
    });

    return NextResponse.json({ ok: true, snoozedUntil });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Failed to snooze notification:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
