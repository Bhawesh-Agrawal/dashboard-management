import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getCurrentUserId, UnauthorizedError } from "@/lib/auth";
import { ownerWhere } from "@/lib/owner-scoping";
import { prisma } from "@/lib/prisma";
import { fetchLinkMetadata } from "@/features/notes/lib/link-enrichment";

export async function POST(req: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const body = (await req.json()) as { url?: unknown; noteId?: unknown };

    if (!body.url || typeof body.url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const meta = await fetchLinkMetadata(body.url);

    if (typeof body.noteId === "string" && body.noteId) {
      const existing = await prisma.note.findFirst({
        where: { id: body.noteId, ...ownerWhere(userId) },
        select: { id: true, title: true },
      });

      if (existing) {
        await prisma.note.update({
          where: { id: existing.id },
          data: {
            meta: meta as unknown as Prisma.InputJsonValue,
            ...(meta.title ? { title: meta.title } : {}),
            ...(meta.thumbnail ? { thumbnailUrl: meta.thumbnail } : {}),
          },
        });
      }
    }

    return NextResponse.json({
      title: meta.title || meta.host,
      description: meta.description || "",
      image: meta.thumbnail || null,
      favicon: null,
      meta,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Link metadata fetch failed:", error);
    return NextResponse.json(
      { title: "", description: "", image: null, favicon: null },
      { status: 200 }
    );
  }
}
