import { NextResponse } from "next/server";
import { getRelatedNotes } from "@/features/notes/lib/semantic-links";
import { getCurrentUserId, UnauthorizedError } from "@/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await getCurrentUserId();
    const { id } = await params;
    const notes = await getRelatedNotes(id, 10);
    return NextResponse.json({ notes });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Failed to fetch related notes:", error);
    return NextResponse.json(
      { error: "Failed to fetch related notes" },
      { status: 500 }
    );
  }
}
