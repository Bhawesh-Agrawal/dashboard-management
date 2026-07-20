import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { markAttendance } from "@/features/attendance/lib/actions";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { courseId, date, status } = body;

    if (!courseId || !date || !status) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Verify the user actually owns this course (security check)
    const course = await prisma.course.findFirst({
      where: {
        id: courseId,
        semester: {
          userId,
        },
      },
    });

    if (!course) {
      return NextResponse.json({ error: "Course not found or unauthorized" }, { status: 403 });
    }

    await markAttendance({
      courseId,
      date,
      status,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to mark attendance from push:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
