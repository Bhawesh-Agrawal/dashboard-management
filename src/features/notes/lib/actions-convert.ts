"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { ownerWhere } from "@/lib/owner-scoping";
import mammoth from "mammoth";
import TurndownService from "turndown";

export async function convertDocxToMarkdown(noteId: string): Promise<{ ok: boolean; error?: string }> {
  const userId = await getCurrentUserId();
  try {
    const note = await prisma.note.findFirst({
      where: { id: noteId, ...ownerWhere(userId) },
    });

    if (!note) {
      return { ok: false, error: "Note not found" };
    }

    if (!note.s3Key) {
      return { ok: false, error: "Document has no file attached in storage" };
    }

    if (note.documentType !== "DOCUMENT") {
      return { ok: false, error: "Only documents (DOCX) can be converted" };
    }

    // Generate a fresh presigned GET URL
    const { getPresignedUrl } = await import("@/lib/s3/client");
    const freshUrl = await getPresignedUrl(note.s3Key, 3600);

    // Fetch the file from S3
    const response = await fetch(freshUrl);
    if (!response.ok) {
      return { ok: false, error: "Failed to download document from storage" };
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Convert DOCX to HTML using Mammoth
    const result = await mammoth.convertToHtml({ buffer });
    const html = result.value;

    // Convert HTML to Markdown using Turndown
    const turndownService = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
    });
    
    let markdown = turndownService.turndown(html);
    
    if (!markdown.trim()) {
      markdown = "*(No text could be extracted from this document)*";
    }

    // Update the note content in the database
    // We append the converted text if there was already some content, 
    // or just replace if it was empty/just a filename
    const newContent = note.content && note.content !== note.fileName && note.content !== note.title
      ? `${note.content}\n\n---\n\n${markdown}`
      : markdown;

    await prisma.note.update({
      where: { id: noteId },
      data: {
        content: newContent,
      },
    });

    return { ok: true };
  } catch (error: any) {
    console.error("Error converting DOCX to Markdown:", error);
    return { ok: false, error: error.message || "Failed to convert document" };
  }
}
