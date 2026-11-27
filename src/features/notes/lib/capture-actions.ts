"use server";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/auth";
import { ownerWhere } from "@/lib/owner-scoping";
import {
  meetingMetaSchema,
  noteKindSchema,
  validateNoteMeta,
  type MeetingMeta,
  type NoteKind,
} from "./capture-types";
import { extractFirstUrl } from "./capture-draft";
import { formatMeetingMarkdown } from "./meeting-format";
import { getInboxNotes, type InboxFilter, type InboxNoteRow } from "./inbox-queries";

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

export async function updateCaptureNote(
  id: string,
  input: {
    title?: string | null;
    content?: string;
    kind?: NoteKind;
    meta?: unknown;
    tags?: string[];
    isPinned?: boolean;
    archivedAt?: Date | null;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const userId = await getCurrentUserId();
    const existing = await prisma.note.findFirst({
      where: { id, ...ownerWhere(userId) },
      select: { id: true, kind: true },
    });
    if (!existing) {
      return { ok: false, error: "Note not found" };
    }

    const effectiveKind = (input.kind ?? existing.kind) as NoteKind;
    let validatedMeta: unknown = undefined;
    if (input.meta !== undefined) {
      const check = validateNoteMeta(effectiveKind, input.meta);
      if (!check.success) {
        return { ok: false, error: check.error.issues[0]?.message ?? "Invalid metadata" };
      }
      validatedMeta = check.data;
    }

    await prisma.note.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.content !== undefined ? { content: input.content } : {}),
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        ...(input.isPinned !== undefined ? { isPinned: input.isPinned } : {}),
        ...(input.archivedAt !== undefined ? { archivedAt: input.archivedAt } : {}),
        ...(validatedMeta !== undefined
          ? { meta: validatedMeta as Prisma.InputJsonValue }
          : {}),
      },
    });

    revalidatePath("/notes");
    revalidatePath(`/notes/${id}`);
    revalidatePath("/today");
    revalidatePath("/brief");
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update note";
    console.error("updateCaptureNote error:", message);
    return { ok: false, error: "Failed to update note" };
  }
}

export async function convertMeetingActionItemsToTasks(
  noteId: string,
  indices?: number[]
): Promise<
  | { ok: true; data: { createdTaskIds: string[]; meta: MeetingMeta } }
  | { ok: false; error: string }
> {
  try {
    const userId = await getCurrentUserId();
    const note = await prisma.note.findFirst({
      where: { id: noteId, ...ownerWhere(userId) },
      select: { id: true, title: true, content: true, meta: true },
    });
    if (!note) {
      return { ok: false, error: "Note not found" };
    }

    const parsed = meetingMetaSchema.safeParse(note.meta);
    if (!parsed.success) {
      return { ok: false, error: "Note does not contain valid meeting metadata" };
    }

    const meta = parsed.data;
    const targetSet = indices ? new Set(indices) : null;
    const createdTaskIds: string[] = [];
    const updatedItems = [...meta.actionItems];

    for (let i = 0; i < updatedItems.length; i++) {
      if (targetSet && !targetSet.has(i)) continue;
      const item = updatedItems[i];
      if (!item || item.taskId) continue;

      let dueDate: Date | null = null;
      if (item.due) {
        const d = new Date(item.due);
        if (!Number.isNaN(d.getTime())) dueDate = d;
      }

      const task = await prisma.task.create({
        data: {
          userId,
          title: item.text,
          notes: `From ${note.title || `Meeting (${meta.date})`}${item.owner ? ` • Owner: ${item.owner}` : ""}`,
          dueDate,
          priority: 2,
        },
        select: { id: true },
      });

      createdTaskIds.push(task.id);
      updatedItems[i] = { ...item, taskId: task.id };
    }

    const nextMeta: MeetingMeta = { ...meta, actionItems: updatedItems };
    await prisma.note.update({
      where: { id: note.id },
      data: {
        meta: nextMeta as unknown as Prisma.InputJsonValue,
        content: formatMeetingMarkdown(nextMeta, note.content),
      },
    });

    revalidatePath("/notes");
    revalidatePath(`/notes/${note.id}`);
    revalidatePath("/tasks");
    revalidatePath("/today");
    return { ok: true, data: { createdTaskIds, meta: nextMeta } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to convert action items";
    console.error("convertMeetingActionItemsToTasks error:", message);
    return { ok: false, error: "Failed to convert action items" };
  }
}

export async function fetchInboxNotesAction(options?: {
  filter?: InboxFilter;
  search?: string;
  limit?: number;
}): Promise<{ ok: true; data: InboxNoteRow[] } | { ok: false; error: string }> {
  try {
    const data = await getInboxNotes(options);
    return { ok: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load notes";
    console.error("fetchInboxNotesAction error:", message);
    return { ok: false, error: "Failed to load notes" };
  }
}

export async function toggleNotePin(
  id: string
): Promise<{ ok: true; isPinned: boolean } | { ok: false; error: string }> {
  try {
    const userId = await getCurrentUserId();
    const note = await prisma.note.findFirst({
      where: { id, ...ownerWhere(userId) },
      select: { id: true, isPinned: true },
    });
    if (!note) return { ok: false, error: "Note not found" };
    const next = !note.isPinned;
    await prisma.note.update({ where: { id }, data: { isPinned: next } });
    revalidatePath("/notes");
    return { ok: true, isPinned: next };
  } catch {
    return { ok: false, error: "Failed to update pin" };
  }
}

export async function toggleNoteArchive(
  id: string
): Promise<{ ok: true; archived: boolean } | { ok: false; error: string }> {
  try {
    const userId = await getCurrentUserId();
    const note = await prisma.note.findFirst({
      where: { id, ...ownerWhere(userId) },
      select: { id: true, archivedAt: true },
    });
    if (!note) return { ok: false, error: "Note not found" };
    const nextArchivedAt = note.archivedAt ? null : new Date();
    await prisma.note.update({ where: { id }, data: { archivedAt: nextArchivedAt } });
    revalidatePath("/notes");
    return { ok: true, archived: nextArchivedAt !== null };
  } catch {
    return { ok: false, error: "Failed to archive note" };
  }
}

export async function addTagToNote(
  id: string,
  tag: string
): Promise<{ ok: true; tags: string[] } | { ok: false; error: string }> {
  try {
    const userId = await getCurrentUserId();
    const cleaned = tag.trim().replace(/^#/, "");
    if (!cleaned) return { ok: false, error: "Tag is required" };
    const note = await prisma.note.findFirst({
      where: { id, ...ownerWhere(userId) },
      select: { id: true, tags: true },
    });
    if (!note) return { ok: false, error: "Note not found" };
    const nextTags = Array.from(new Set([...note.tags, cleaned]));
    await prisma.note.update({ where: { id }, data: { tags: nextTags } });
    revalidatePath("/notes");
    return { ok: true, tags: nextTags };
  } catch {
    return { ok: false, error: "Failed to add tag" };
  }
}

export async function convertNoteToTask(
  id: string
): Promise<{ ok: true; taskId: string } | { ok: false; error: string }> {
  try {
    const userId = await getCurrentUserId();
    const note = await prisma.note.findFirst({
      where: { id, ...ownerWhere(userId) },
      select: { id: true, title: true, content: true, sourceLink: true },
    });
    if (!note) return { ok: false, error: "Note not found" };
    const firstLine = note.content.split(/\r?\n/)[0]?.trim() || "Note task";
    const task = await prisma.task.create({
      data: {
        userId,
        title: (note.title?.trim() || firstLine).slice(0, 140),
        notes: note.sourceLink ? `${note.content}\n\n${note.sourceLink}` : note.content,
        priority: 2,
      },
      select: { id: true },
    });
    revalidatePath("/tasks");
    revalidatePath("/today");
    return { ok: true, taskId: task.id };
  } catch {
    return { ok: false, error: "Failed to convert to task" };
  }
}
