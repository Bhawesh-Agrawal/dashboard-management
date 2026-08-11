import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { tag, duration } = body;

    if (!tag) {
      return NextResponse.json({ error: "Missing tag" }, { status: 400 });
    }

    // Default snooze duration: until class starts (or 30 minutes if not specified)
    // For class_start notifications, snooze until the class start time
    // For attendance notifications, snooze for 5 minutes to prevent re-triggering
    const snoozeDuration = duration || 30 * 60 * 1000; // 30 minutes default
    const snoozedUntil = new Date(Date.now() + snoozeDuration);

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
    console.error("Failed to snooze notification:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
