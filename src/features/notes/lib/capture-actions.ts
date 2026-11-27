"use server";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/auth";
import { ownerWhere } from "@/lib/owner-scoping";
import {
  noteKindSchema,
  validateNoteMeta,
  type NoteKind,
} from "./capture-types";
import { extractFirstUrl } from "./capture-draft";

export interface CreateCaptureInput {
  kind?: NoteKind;
  title?: string | null;
  content: string;
  sourceLink?: string | null;
  tags?: string[];
  meta?: unknown;
}

export async function createCaptureNote(
  input: CreateCaptureInput
): Promise<{ ok: true; data: { id: string; kind: NoteKind; url?: string } } | { ok: false; error: string }> {
  try {
    const userId = await getCurrentUserId();
    const kindResult = noteKindSchema.safeParse(input.kind ?? "note");
    if (!kindResult.success) {
      return { ok: false, error: "Invalid note kind" };
    }
    const kind = kindResult.data;
    const content = input.content.trim();
    if (!content) {
      return { ok: false, error: "Content is required" };
    }

    let resolvedSourceLink = input.sourceLink?.trim() || null;
    let resolvedMeta: unknown = input.meta;
    let resolvedTitle = input.title?.trim() || null;

    if (kind === "link") {
      const url = resolvedSourceLink || extractFirstUrl(content);
      if (!url) {
        return { ok: false, error: "A valid http(s) URL is required for link captures" };
      }
      resolvedSourceLink = url;
      const host = new URL(url).hostname.replace(/^www\./, "");
      if (!resolvedTitle) resolvedTitle = host;
      if (!resolvedMeta) {
        resolvedMeta = {
          url,
          host,
          contentType: "generic",
        };
      }
    }

    if (kind === "quote" && !resolvedMeta) {
      resolvedMeta = { text: content };
    }

    if (resolvedMeta !== undefined && resolvedMeta !== null) {
      const metaCheck = validateNoteMeta(kind, resolvedMeta);
      if (!metaCheck.success) {
        return { ok: false, error: metaCheck.error.issues[0]?.message ?? "Invalid note metadata" };
      }
      resolvedMeta = metaCheck.data;
    }

    const created = await prisma.note.create({
      data: {
        userId,
        kind,
        title: resolvedTitle,
        content,
        sourceLink: resolvedSourceLink,
        originalUrl: resolvedSourceLink,
        tags: input.tags ?? [],
        ...(resolvedMeta !== undefined && resolvedMeta !== null
          ? { meta: resolvedMeta as Prisma.InputJsonValue }
          : {}),
      },
      select: { id: true },
    });

    revalidatePath("/notes");
    revalidatePath("/today");
    revalidatePath("/brief");

    return {
      ok: true,
      data: {
        id: created.id,
        kind,
        ...(resolvedSourceLink ? { url: resolvedSourceLink } : {}),
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save capture";
    console.error("createCaptureNote error:", message);
    return { ok: false, error: "Failed to save capture" };
  }
}

export async function undoCaptureNote(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const userId = await getCurrentUserId();
    const existing = await prisma.note.findFirst({
      where: { id, ...ownerWhere(userId) },
      select: { id: true },
    });
    if (!existing) {
      return { ok: false, error: "Note not found" };
    }

    await prisma.note.delete({ where: { id } });
    revalidatePath("/notes");
    revalidatePath("/today");
    revalidatePath("/brief");
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to undo capture";
    console.error("undoCaptureNote error:", message);
    return { ok: false, error: "Failed to undo capture" };
  }
}
