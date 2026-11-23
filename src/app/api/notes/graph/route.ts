import { NextResponse } from "next/server";
import { getNoteGraphData } from "@/features/notes/lib/semantic-links";
import { getCurrentUserId, UnauthorizedError } from "@/lib/auth";

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const graphData = await getNoteGraphData(userId, 100);
    return NextResponse.json(graphData);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Failed to fetch graph data:", error);
    return NextResponse.json(
      { error: "Failed to fetch graph data" },
      { status: 500 }
    );
  }
}
