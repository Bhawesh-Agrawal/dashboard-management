import { NextResponse } from "next/server";
import { UnauthorizedError } from "@/lib/auth";
import { markAttendance } from "@/features/attendance/lib/actions";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { courseId, classScheduleId, date, status } = body;

    if (!courseId || !date || !status) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const result = await markAttendance({
      courseId,
      classScheduleId,
      date,
      status,
    });

    return NextResponse.json({ ok: true, record: result.record, summary: result.summary });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Failed to mark attendance from push:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
