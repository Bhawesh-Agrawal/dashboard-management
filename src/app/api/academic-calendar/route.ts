import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { getAcademicEntriesForRange } from "@/features/semesters/lib/calendar-queries";

export async function GET(request: Request) {
  try {
    const userId = await getCurrentUserId();
    const { searchParams } = new URL(request.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    if (!start || !end) {
      return NextResponse.json(
        { error: "start and end query parameters are required" },
        { status: 400 }
      );
    }

    const entries = await getAcademicEntriesForRange(userId, start, end);
    return NextResponse.json({ entries });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
