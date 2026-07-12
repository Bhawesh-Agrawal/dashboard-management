"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/auth";
import { deleteFile } from "@/lib/s3/actions";
import {
  createDocumentNoteSchema,
  updateDocumentNoteSchema,
  documentFiltersSchema,
  createFolderSchema,
  updateFolderSchema,
} from "./validation";
import type { CreateDocumentNoteInput, UpdateDocumentNoteInput, DocumentFilters } from "@/types";
import type { Prisma } from "@prisma/client";

// Re-export annotation actions
export {
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
  getAnnotations,
} from "./actions-annotations";

// ─── Types ──────────────────────────────────────────────────

type NoteWithRelations = Prisma.NoteGetPayload<{
  include: {
    course: { select: { id: true; name: true; color: true } };
    folder: { select: { id: true; name: true; type: true; color: true } };
    noteAttachments: true;
    _count: { select: { noteAttachments: true; annotations: true } };
  };
}>;

type NoteWithDetailRelations = Prisma.NoteGetPayload<{
  include: {
    course: { select: { id: true; name: true; color: true } };
    folder: { select: { id: true; name: true; type: true; color: true } };
    noteAttachments: true;
    annotations: true;
  };
}>;

const noteInclude = {
  course: { select: { id: true, name: true, color: true } },
  folder: { select: { id: true, name: true, type: true, color: true } },
  noteAttachments: true,
  _count: {
    select: { noteAttachments: true, annotations: true },
  },
};

const noteDetailInclude = {
  course: { select: { id: true, name: true, color: true } },
  folder: { select: { id: true, name: true, type: true, color: true } },
  noteAttachments: true,
  annotations: true,
};

// ─── Folder Actions ─────────────────────────────────────────

const MAX_FOLDER_DEPTH = 5;

export async function createDocumentFolder(data: {
  name: string;
  description?: string;
  type?: "PYQ" | "RESOURCE_BOOK" | "LECTURE_NOTE" | "ASSIGNMENT" | "REFERENCE" | "PROJECT" | "GENERAL";
  color?: string;
  icon?: string;
  parentId?: string;
  courseId?: string;
  semesterId?: string;
}): Promise<{ ok: true; data: { id: string; name: string } } | { ok: false; error: string }> {
  try {
    const userId = await getCurrentUserId();

    const validated = createFolderSchema.safeParse(data);
    if (!validated.success) {
      return { ok: false, error: validated.error.issues[0].message };
    }

    if (validated.data.parentId) {
      const parent = await prisma.documentFolder.findUnique({
        where: { id: validated.data.parentId },
        select: { userId: true },
      });
      if (!parent || parent.userId !== userId) {
        return { ok: false, error: "Parent folder not found" };
      }
    }

    const maxSort = await prisma.documentFolder.aggregate({
      where: { userId, parentId: validated.data.parentId ?? null },
      _max: { sortOrder: true },
    });

    const folder = await prisma.documentFolder.create({
      data: {
        userId,
        name: validated.data.name,
        description: validated.data.description,
        type: validated.data.type ?? "GENERAL",
        color: validated.data.color,
        icon: validated.data.icon,
        parentId: validated.data.parentId,
        courseId: validated.data.courseId,
        semesterId: validated.data.semesterId,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
      select: { id: true, name: true },
    });

    revalidatePath("/notes");

    return { ok: true, data: folder };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to create document folder:", message);
    return { ok: false, error: "Failed to create folder" };
  }
}

export async function updateDocumentFolder(
  id: string,
  data: {
    name?: string;
    description?: string | null;
    type?: "PYQ" | "RESOURCE_BOOK" | "LECTURE_NOTE" | "ASSIGNMENT" | "REFERENCE" | "PROJECT" | "GENERAL";
    color?: string | null;
    icon?: string | null;
    isPinned?: boolean;
    sortOrder?: number;
    courseId?: string | null;
    semesterId?: string | null;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const userId = await getCurrentUserId();

    const folder = await prisma.documentFolder.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!folder) {
      return { ok: false, error: "Folder not found" };
    }

    if (folder.userId !== userId) {
      return { ok: false, error: "Access denied" };
    }

    const validated = updateFolderSchema.safeParse(data);
    if (!validated.success) {
      return { ok: false, error: validated.error.issues[0].message };
    }

    await prisma.documentFolder.update({
      where: { id },
      data: validated.data,
    });

    revalidatePath("/notes");

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to update document folder:", message);
    return { ok: false, error: "Failed to update folder" };
  }
}

export async function deleteDocumentFolder(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const userId = await getCurrentUserId();

    const folder = await prisma.documentFolder.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!folder) {
      return { ok: false, error: "Folder not found" };
    }

    if (folder.userId !== userId) {
      return { ok: false, error: "Access denied" };
    }

    await prisma.note.updateMany({
      where: { folderId: id },
      data: { folderId: null },
    });

    await prisma.documentFolder.updateMany({
      where: { parentId: id },
      data: { parentId: null },
    });

    await prisma.documentFolder.delete({ where: { id } });

    revalidatePath("/notes");

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to delete document folder:", message);
    return { ok: false, error: "Failed to delete folder" };
  }
}

export async function getDocumentFolders(
  userId: string,
  parentId?: string | null
) {
  return prisma.documentFolder.findMany({
    where: { userId, parentId: parentId ?? null },
    orderBy: [{ isPinned: "desc" }, { sortOrder: "asc" }],
    include: {
      _count: {
        select: { notes: true, children: true },
      },
    },
  });
}

export async function getFolderBreadcrumb(
  folderId: string
): Promise<{ ok: true; data: { id: string; name: string }[] } | { ok: false; error: string }> {
  try {
    const userId = await getCurrentUserId();

    const folder = await prisma.documentFolder.findUnique({
      where: { id: folderId },
      select: { userId: true },
    });

    if (!folder) {
      return { ok: false, error: "Folder not found" };
    }

    if (folder.userId !== userId) {
      return { ok: false, error: "Access denied" };
    }

    const breadcrumb: { id: string; name: string }[] = [];
    let currentId: string | null = folderId;

    while (currentId) {
      const current: { id: string; name: string; parentId: string | null } | null = await prisma.documentFolder.findUnique({
        where: { id: currentId },
        select: { id: true, name: true, parentId: true },
      });

      if (!current) break;

      breadcrumb.unshift({ id: current.id, name: current.name });
      currentId = current.parentId;
    }

    return { ok: true, data: breadcrumb };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to get folder breadcrumb:", message);
    return { ok: false, error: "Failed to get breadcrumb" };
  }
}

export async function moveDocumentFolder(
  id: string,
  newParentId: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const userId = await getCurrentUserId();

    const folder = await prisma.documentFolder.findUnique({
      where: { id },
      select: { userId: true, parentId: true },
    });

    if (!folder) {
      return { ok: false, error: "Folder not found" };
    }

    if (folder.userId !== userId) {
      return { ok: false, error: "Access denied" };
    }

    if (id === newParentId) {
      return { ok: false, error: "Cannot move folder to itself" };
    }

    if (newParentId) {
      const newParent = await prisma.documentFolder.findUnique({
        where: { id: newParentId },
        select: { userId: true },
      });

      if (!newParent || newParent.userId !== userId) {
        return { ok: false, error: "Target folder not found" };
      }

      let depth = 1;
      let currentParentId: string | null = newParentId;

      while (currentParentId && depth < MAX_FOLDER_DEPTH) {
        const parent: { parentId: string | null } | null = await prisma.documentFolder.findUnique({
          where: { id: currentParentId },
          select: { parentId: true },
        });

        if (!parent) break;
        currentParentId = parent.parentId;
        depth++;
      }

      if (depth >= MAX_FOLDER_DEPTH) {
        return { ok: false, error: `Maximum folder nesting depth of ${MAX_FOLDER_DEPTH} exceeded` };
      }
    }

    await prisma.documentFolder.update({
      where: { id },
      data: { parentId: newParentId },
    });

    revalidatePath("/notes");

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to move document folder:", message);
    return { ok: false, error: "Failed to move folder" };
  }
}

export async function pinDocumentFolder(
  id: string,
  pinned: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const userId = await getCurrentUserId();

    const folder = await prisma.documentFolder.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!folder) {
      return { ok: false, error: "Folder not found" };
    }

    if (folder.userId !== userId) {
      return { ok: false, error: "Access denied" };
    }

    await prisma.documentFolder.update({
      where: { id },
      data: { isPinned: pinned },
    });

    revalidatePath("/notes");

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to pin document folder:", message);
    return { ok: false, error: "Failed to pin folder" };
  }
}

// ─── Document Note Actions ──────────────────────────────────

export async function createDocumentNote(
  data: CreateDocumentNoteInput
): Promise<{ ok: true; data: { id: string } } | { ok: false; error: string }> {
  try {
    const userId = await getCurrentUserId();

    const validated = createDocumentNoteSchema.safeParse(data);
    if (!validated.success) {
      return { ok: false, error: validated.error.issues[0].message };
    }

    const note = await prisma.note.create({
      data: {
        userId,
        title: validated.data.title,
        content: validated.data.content ?? "",
        isDocumentLibraryEntry: true,
        folderId: validated.data.folderId,
        courseId: validated.data.courseId,
        documentType: validated.data.documentType,
        s3Key: validated.data.s3Key,
        s3Url: validated.data.s3Url,
        fileSize: validated.data.fileSize,
        fileName: validated.data.fileName,
        mimeType: validated.data.mimeType,
        thumbnailUrl: validated.data.thumbnailUrl,
        pageCount: validated.data.pageCount,
        originalUrl: validated.data.originalUrl,
        embedHtml: validated.data.embedHtml,
        tags: validated.data.tags ?? [],
      },
      select: { id: true },
    });

    revalidatePath("/notes");
    if (validated.data.folderId) revalidatePath(`/notes?folderId=${validated.data.folderId}`);

    return { ok: true, data: note };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to create document note:", message);
    return { ok: false, error: "Failed to create document note" };
  }
}

export async function updateDocumentNote(
  id: string,
  data: UpdateDocumentNoteInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const userId = await getCurrentUserId();

    const note = await prisma.note.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!note) {
      return { ok: false, error: "Note not found" };
    }

    if (note.userId !== userId) {
      return { ok: false, error: "Access denied" };
    }

    const validated = updateDocumentNoteSchema.safeParse(data);
    if (!validated.success) {
      return { ok: false, error: validated.error.issues[0].message };
    }

    await prisma.note.update({
      where: { id },
      data: validated.data,
    });

    revalidatePath("/notes");
    revalidatePath(`/notes/${id}`);

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to update document note:", message);
    return { ok: false, error: "Failed to update document note" };
  }
}

export async function deleteDocumentNote(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const userId = await getCurrentUserId();

    const note = await prisma.note.findUnique({
      where: { id },
      select: {
        userId: true,
        courseId: true,
        folderId: true,
        s3Key: true,
        noteAttachments: { select: { id: true, s3Key: true } },
      },
    });

    if (!note) {
      return { ok: false, error: "Note not found" };
    }

    if (note.userId !== userId) {
      return { ok: false, error: "Access denied" };
    }

    const s3KeysToDelete: string[] = [];
    if (note.s3Key) {
      s3KeysToDelete.push(note.s3Key);
    }
    for (const attachment of note.noteAttachments) {
      if (attachment.s3Key) {
        s3KeysToDelete.push(attachment.s3Key);
      }
    }

    for (const key of s3KeysToDelete) {
      const result = await deleteFile(key);
      if (!result.ok) {
        return { ok: false, error: `Failed to delete file from storage: ${key}` };
      }
    }

    await prisma.noteAnnotation.deleteMany({ where: { noteId: id } });
    await prisma.noteAttachment.deleteMany({ where: { noteId: id } });
    await prisma.note.delete({ where: { id } });

    revalidatePath("/notes");
    if (note.courseId) revalidatePath(`/courses/${note.courseId}`);
    if (note.folderId) revalidatePath(`/notes?folderId=${note.folderId}`);

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to delete document note:", message);
    return { ok: false, error: "Failed to delete document note" };
  }
}

export async function getDocumentNotes(
  userId: string,
  filters: DocumentFilters
): Promise<{ ok: true; data: { notes: NoteWithRelations[]; total: number; page: number; pageSize: number } } | { ok: false; error: string }> {
  try {
    const validated = documentFiltersSchema.safeParse(filters);
    if (!validated.success) {
      return { ok: false, error: validated.error.issues[0].message };
    }

    const f = validated.data;
    const where: Prisma.NoteWhereInput = {
      userId,
      isDocumentLibraryEntry: true,
    };

    if (f.folderId) where.folderId = f.folderId;
    if (f.courseId) where.courseId = f.courseId;
    if (f.type) where.documentType = f.type;
    if (f.isFavorite) where.isFavorite = true;
    if (f.searchQuery) {
      where.OR = [
        { title: { contains: f.searchQuery, mode: "insensitive" } },
        { content: { contains: f.searchQuery, mode: "insensitive" } },
        { extractedText: { contains: f.searchQuery, mode: "insensitive" } },
      ];
    }

    const orderBy: Prisma.NoteOrderByWithRelationInput = {};
    if (f.sortBy === "title") {
      orderBy.title = f.sortOrder;
    } else if (f.sortBy === "lastViewedAt") {
      orderBy.lastViewedAt = f.sortOrder;
    } else if (f.sortBy === "fileSize") {
      orderBy.fileSize = f.sortOrder;
    } else {
      orderBy.createdAt = f.sortOrder;
    }

    const [notes, total] = await Promise.all([
      prisma.note.findMany({
        where,
        orderBy,
        skip: (f.page - 1) * f.pageSize,
        take: f.pageSize,
        include: noteInclude,
      }),
      prisma.note.count({ where }),
    ]);

    return { ok: true, data: { notes, total, page: f.page, pageSize: f.pageSize } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to get document notes:", message);
    return { ok: false, error: "Failed to load document notes" };
  }
}

export async function getDocumentNoteById(
  id: string
): Promise<{ ok: true; data: NoteWithDetailRelations } | { ok: false; error: string }> {
  try {
    const userId = await getCurrentUserId();

    const note = await prisma.note.findUnique({
      where: { id },
      include: noteDetailInclude,
    });

    if (!note) {
      return { ok: false, error: "Note not found" };
    }

    if (note.userId !== userId) {
      return { ok: false, error: "Access denied" };
    }

    return { ok: true, data: note };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to get document note:", message);
    return { ok: false, error: "Failed to load document note" };
  }
}

export async function searchDocumentNotes(
  userId: string,
  query: string
): Promise<{ ok: true; data: NoteWithRelations[] } | { ok: false; error: string }> {
  try {
    if (!query.trim()) {
      return { ok: true, data: [] };
    }

    const notes = await prisma.note.findMany({
      where: {
        userId,
        isDocumentLibraryEntry: true,
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { content: { contains: query, mode: "insensitive" } },
          { extractedText: { contains: query, mode: "insensitive" } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: noteInclude,
    });

    return { ok: true, data: notes };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to search document notes:", message);
    return { ok: false, error: "Failed to search notes" };
  }
}

export async function pinDocumentNote(
  id: string,
  pinned: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const userId = await getCurrentUserId();

    const note = await prisma.note.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!note) {
      return { ok: false, error: "Note not found" };
    }

    if (note.userId !== userId) {
      return { ok: false, error: "Access denied" };
    }

    await prisma.note.update({
      where: { id },
      data: { isPinned: pinned },
    });

    revalidatePath("/notes");

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to pin document note:", message);
    return { ok: false, error: "Failed to pin note" };
  }
}

export async function favoriteDocumentNote(
  id: string,
  favorite: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const userId = await getCurrentUserId();

    const note = await prisma.note.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!note) {
      return { ok: false, error: "Note not found" };
    }

    if (note.userId !== userId) {
      return { ok: false, error: "Access denied" };
    }

    await prisma.note.update({
      where: { id },
      data: { isFavorite: favorite },
    });

    revalidatePath("/notes");

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to favorite document note:", message);
    return { ok: false, error: "Failed to favorite note" };
  }
}

export async function moveDocumentNote(
  id: string,
  newFolderId: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const userId = await getCurrentUserId();

    const note = await prisma.note.findUnique({
      where: { id },
      select: { userId: true, folderId: true },
    });

    if (!note) {
      return { ok: false, error: "Note not found" };
    }

    if (note.userId !== userId) {
      return { ok: false, error: "Access denied" };
    }

    if (newFolderId) {
      const folder = await prisma.documentFolder.findUnique({
        where: { id: newFolderId },
        select: { userId: true },
      });

      if (!folder || folder.userId !== userId) {
        return { ok: false, error: "Target folder not found" };
      }
    }

    await prisma.note.update({
      where: { id },
      data: { folderId: newFolderId },
    });

    revalidatePath("/notes");
    if (note.folderId) revalidatePath(`/notes?folderId=${note.folderId}`);
    if (newFolderId) revalidatePath(`/notes?folderId=${newFolderId}`);

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to move document note:", message);
    return { ok: false, error: "Failed to move note" };
  }
}
