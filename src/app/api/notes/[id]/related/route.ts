import { NextResponse } from "next/server";
import { getRelatedNotes } from "@/features/notes/lib/semantic-links";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const notes = await getRelatedNotes(id, 10);
    return NextResponse.json({ notes });
  } catch (error) {
    console.error("Failed to fetch related notes:", error);
    return NextResponse.json(
      { error: "Failed to fetch related notes" },
      { status: 500 }
    );
  }
}
