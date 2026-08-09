"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/auth";
import { createExplicitLink } from "./semantic-links";
import type { FolderType } from "@prisma/client";

type ImportResult = {
  notesCreated: number;
  foldersCreated: number;
  linksResolved: number;
  unresolvedLinks: string[];
  noteIdMap: Map<string, string>; // title -> id
};

function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };

  const yamlBlock = match[1];
  const body = match[2];
  const frontmatter: Record<string, unknown> = {};

  for (const line of yamlBlock.split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;
    const key = line.slice(0, colonIndex).trim();
    let value: unknown = line.slice(colonIndex + 1).trim();

    // Parse arrays: [tag1, tag2] or multiline
    if (typeof value === "string" && value.startsWith("[") && value.endsWith("]")) {
      value = value
        .slice(1, -1)
        .split(",")
        .map((s: string) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else if (typeof value === "string") {
      value = value.replace(/^["']|["']$/g, "");
    }

    frontmatter[key] = value;
  }

  return { frontmatter, body };
}

function extractWikilinks(content: string): string[] {
  const links: string[] = [];
  const regex = /\[\[([^\]]+)\]\]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    links.push(match[1]);
  }
  return links;
}

function getFolderPath(filePath: string): string[] {
  const parts = filePath.split("/").slice(0, -1); // Remove filename
  return parts;
}

function inferFolderType(pathParts: string[]): FolderType {
  const lower = pathParts.join(" ").toLowerCase();
  if (lower.includes("pyq") || lower.includes("question")) return "PYQ";
  if (lower.includes("book") || lower.includes("reference")) return "RESOURCE_BOOK";
  if (lower.includes("lecture") || lower.includes("class")) return "LECTURE_NOTE";
  if (lower.includes("assignment") || lower.includes("hw")) return "ASSIGNMENT";
  if (lower.includes("project")) return "PROJECT";
  return "GENERAL";
}

export async function importVaultFiles(files: { name: string; content: string }[]): Promise<{
  ok: true;
  data: ImportResult;
} | { ok: false; error: string }> {
  try {
    const userId = await getCurrentUserId();
    const result: ImportResult = {
      notesCreated: 0,
      foldersCreated: 0,
      linksResolved: 0,
      unresolvedLinks: [],
      noteIdMap: new Map(),
    };

    // 1. Collect all folder paths and create them
    const allFolderPaths = new Set<string>();
    for (const file of files) {
      if (!file.name.endsWith(".md")) continue;
      const folderParts = getFolderPath(file.name);
      // Build all ancestor paths
      for (let i = 1; i <= folderParts.length; i++) {
        allFolderPaths.add(folderParts.slice(0, i).join("/"));
      }
    }

    // Sort paths by depth to create parents first
    const sortedPaths = [...allFolderPaths].sort(
      (a, b) => a.split("/").length - b.split("/").length
    );

    const folderIdMap = new Map<string, string>(); // path -> id

    for (const folderPath of sortedPaths) {
      const parts = folderPath.split("/");
      const name = parts[parts.length - 1];
      const parentPath = parts.length > 1 ? parts.slice(0, -1).join("/") : null;
      const parentId = parentPath ? folderIdMap.get(parentPath) : undefined;

      // Check if folder already exists
      const existing = await prisma.documentFolder.findFirst({
        where: { userId, name, parentId: parentId || null },
      });

      if (existing) {
        folderIdMap.set(folderPath, existing.id);
      } else {
        const folder = await prisma.documentFolder.create({
          data: {
            userId,
            name,
            type: inferFolderType(parts),
            parentId: parentId || null,
          },
        });
        folderIdMap.set(folderPath, folder.id);
        result.foldersCreated++;
      }
    }

    // 2. Create notes from .md files
    for (const file of files) {
      if (!file.name.endsWith(".md")) continue;

      const { frontmatter, body } = parseFrontmatter(file.content);
      const title =
        (typeof frontmatter.title === "string" ? frontmatter.title : null) ||
        file.name.replace(/\.md$/, "").split("/").pop() ||
        "Untitled";

      const tags = Array.isArray(frontmatter.tags)
        ? frontmatter.tags.map(String)
        : typeof frontmatter.tags === "string"
          ? [frontmatter.tags]
          : [];

      const folderParts = getFolderPath(file.name);
      const folderPath = folderParts.join("/");
      const folderId = folderIdMap.get(folderPath) || null;

      const note = await prisma.note.create({
        data: {
          userId,
          title,
          content: body.trim(),
          tags,
          folderId,
          isDocumentLibraryEntry: true,
        },
        select: { id: true },
      });

      result.noteIdMap.set(title, note.id);
      result.notesCreated++;
    }

    // 3. Resolve wikilinks across all imported notes
    for (const file of files) {
      if (!file.name.endsWith(".md")) continue;

      const { frontmatter, body } = parseFrontmatter(file.content);
      const sourceTitle =
        (typeof frontmatter.title === "string" ? frontmatter.title : null) ||
        file.name.replace(/\.md$/, "").split("/").pop() ||
        "Untitled";

      const sourceId = result.noteIdMap.get(sourceTitle);
      if (!sourceId) continue;

      const wikilinks = extractWikilinks(body);
      for (const linkTitle of wikilinks) {
        const targetId = result.noteIdMap.get(linkTitle);
        if (targetId) {
          await createExplicitLink(sourceId, targetId);
          result.linksResolved++;
        } else {
          result.unresolvedLinks.push(linkTitle);
        }
      }
    }

    revalidatePath("/notes");

    return { ok: true, data: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to import vault:", message);
    return { ok: false, error: "Failed to import vault" };
  }
}

export async function getOrCreateDailyNote(): Promise<
  { ok: true; data: { id: string } } | { ok: false; error: string }
> {
  try {
    const userId = await getCurrentUserId();

    const today = new Date();
    const dateStr = today.toISOString().split("T")[0]; // YYYY-MM-DD
    const title = dateStr;

    // Check if today's daily note exists
    const existing = await prisma.note.findFirst({
      where: {
        userId,
        title,
        tags: { has: "daily-note" },
      },
      select: { id: true },
    });

    if (existing) {
      return { ok: true, data: existing };
    }

    // Create today's daily note
    const note = await prisma.note.create({
      data: {
        userId,
        title,
        content: `# ${dateStr}\n\n`,
        tags: ["daily-note"],
      },
      select: { id: true },
    });

    revalidatePath("/notes");
    return { ok: true, data: note };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to get/create daily note:", message);
    return { ok: false, error: "Failed to load daily note" };
  }
}
