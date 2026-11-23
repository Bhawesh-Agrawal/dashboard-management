import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId, UnauthorizedError } from "@/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = await getCurrentUserId();

    // Fetch incoming links (notes that link TO this note)
    const incomingLinks = await prisma.noteLink.findMany({
      where: {
        targetId: id,
        source: { userId },
      },
      include: {
        source: {
          include: {
            course: { select: { id: true, name: true, color: true } },
          },
        },
      },
      orderBy: { strength: "desc" },
      take: 10,
    });

    const notes = incomingLinks.map((link) => ({
      ...link.source,
      score: link.strength,
      linkType: link.linkType,
      contextSnippet: link.source.content.slice(0, 100) + 
        (link.source.content.length > 100 ? "..." : ""),
    }));

    return NextResponse.json({ notes });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Failed to fetch backlinks:", error);
    return NextResponse.json(
      { error: "Failed to fetch backlinks" },
      { status: 500 }
    );
  }
}
