import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { getCurrentUserId } from "@/lib/auth";
import { ownerWhere } from "@/lib/owner-scoping";

export type InboxFilter =
  | "all"
  | "link"
  | "quote"
  | "meeting"
  | "checklist"
  | "note"
  | "pinned"
  | "archived";

export interface InboxNoteRow {
  id: string;
  kind: string;
  title: string | null;
  content: string;
  sourceLink: string | null;
  originalUrl: string | null;
  thumbnailUrl: string | null;
  tags: string[];
  meta: unknown;
  isPinned: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function buildInboxWhere(
  userId: string,
  options?: { filter?: InboxFilter; search?: string }
): Prisma.NoteWhereInput {
  const filter = options?.filter ?? "all";
  const search = options?.search?.trim() ?? "";

  const conditions: Prisma.NoteWhereInput[] = [
    ownerWhere(userId),
    { isDocumentLibraryEntry: false },
  ];

  if (filter === "archived") {
    conditions.push({ archivedAt: { not: null } });
  } else {
    conditions.push({ archivedAt: null });
  }

  if (filter === "pinned") {
    conditions.push({ isPinned: true });
  } else if (
    filter === "link" ||
    filter === "quote" ||
    filter === "meeting" ||
    filter === "checklist" ||
    filter === "note"
  ) {
    conditions.push({ kind: filter });
  }

  if (search) {
    const tagCandidates = Array.from(new Set([search, search.toLowerCase()]));
    conditions.push({
      OR: [
        { title: { contains: search, mode: "insensitive" } },
        { content: { contains: search, mode: "insensitive" } },
        { sourceLink: { contains: search, mode: "insensitive" } },
        { originalUrl: { contains: search, mode: "insensitive" } },
        { tags: { hasSome: tagCandidates } },
      ],
    });
  }

  return { AND: conditions };
}

export async function getInboxNotes(options?: {
  filter?: InboxFilter;
  search?: string;
  limit?: number;
  userId?: string;
}): Promise<InboxNoteRow[]> {
  const userId = options?.userId ?? (await getCurrentUserId());
  const take = Math.min(Math.max(options?.limit ?? 50, 1), 100);

  return prisma.note.findMany({
    where: buildInboxWhere(userId, options),
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    take,
    select: {
      id: true,
      kind: true,
      title: true,
      content: true,
      sourceLink: true,
      originalUrl: true,
      thumbnailUrl: true,
      tags: true,
      meta: true,
      isPinned: true,
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}
