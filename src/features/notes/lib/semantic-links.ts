import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { ownerWhere } from "@/lib/owner-scoping";
import type { NoteWithScore, NoteGraphData, NoteGraphNode, NoteGraphEdge } from "@/types";

// ─── Stopwords ──────────────────────────────────────────────
// Common English words to ignore during keyword extraction
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "as", "is", "was", "are", "were", "be",
  "been", "being", "have", "has", "had", "do", "does", "did", "will",
  "would", "could", "should", "may", "might", "shall", "can", "need",
  "dare", "ought", "used", "this", "that", "these", "those", "i", "you",
  "he", "she", "it", "we", "they", "me", "him", "her", "us", "them",
  "my", "your", "his", "its", "our", "their", "mine", "yours", "hers",
  "ours", "theirs", "what", "which", "who", "whom", "where", "when",
  "why", "how", "all", "each", "every", "both", "few", "more", "most",
  "other", "some", "such", "no", "nor", "not", "only", "own", "same",
  "so", "than", "too", "very", "just", "because", "if", "then", "else",
  "while", "about", "up", "out", "into", "through", "during", "before",
  "after", "above", "below", "between", "under", "again", "further",
  "once", "here", "there", "also", "any", "get", "got", "make", "made",
  "take", "took", "come", "came", "go", "went", "gone", "see", "saw",
  "know", "knew", "known", "think", "thought", "say", "said", "tell",
  "told", "give", "gave", "given", "find", "found", "want", "let",
  "keep", "put", "set", "run", "use", "try", "ask", "work", "seem",
  "feel", "like", "look", "much", "well", "still", "back", "even",
  "new", "now", "way", "may", "right", "big", "high", "old", "long",
  "great", "little", "own", "small", "good", "first", "last", "next",
]);

// ─── Keyword Extraction ─────────────────────────────────────

/**
 * Extract keywords from text using simple TF (term frequency) scoring.
 * Returns a Map of keyword -> frequency score.
 */
function extractKeywords(content: string): Map<string, number> {
  const words = content
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ") // Remove punctuation
    .split(/\s+/) // Split by whitespace
    .filter((word) => word.length > 2 && !STOPWORDS.has(word)); // Filter short words and stopwords

  const frequency = new Map<string, number>();

  for (const word of words) {
    frequency.set(word, (frequency.get(word) || 0) + 1);
  }

  // Normalize by total word count for TF scoring
  const totalWords = words.length;
  if (totalWords > 0) {
    for (const [key, value] of frequency) {
      frequency.set(key, value / totalWords);
    }
  }

  return frequency;
}

// ─── Similarity Calculation ─────────────────────────────────

/**
 * Calculate cosine similarity between two keyword vectors.
 * Returns a score between 0 (no similarity) and 1 (identical).
 */
function calculateSimilarity(
  keywords1: Map<string, number>,
  keywords2: Map<string, number>
): number {
  // Find common terms
  const commonTerms: string[] = [];
  for (const term of keywords1.keys()) {
    if (keywords2.has(term)) {
      commonTerms.push(term);
    }
  }

  if (commonTerms.length === 0) return 0;

  // Calculate dot product and magnitudes
  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;

  for (const term of commonTerms) {
    const val1 = keywords1.get(term) || 0;
    const val2 = keywords2.get(term) || 0;
    dotProduct += val1 * val2;
  }

  for (const val of keywords1.values()) {
    magnitude1 += val * val;
  }

  for (const val of keywords2.values()) {
    magnitude2 += val * val;
  }

  magnitude1 = Math.sqrt(magnitude1);
  magnitude2 = Math.sqrt(magnitude2);

  if (magnitude1 === 0 || magnitude2 === 0) return 0;

  return dotProduct / (magnitude1 * magnitude2);
}

// ─── Core Functions ─────────────────────────────────────────

/**
 * Generate semantic links for a single note.
 * Compares against all other user notes and creates NoteLink records
 * for similarities above the threshold (0.6).
 */
export async function generateSemanticLinks(
  noteId: string
): Promise<{ created: number; updated: number }> {
  const userId = await getCurrentUserId();

  // Fetch the target note
  const targetNote = await prisma.note.findUnique({
    where: { id: noteId },
    select: { id: true, content: true, userId: true },
  });

  if (!targetNote || targetNote.userId !== userId) {
    return { created: 0, updated: 0 };
  }

  // Extract keywords from target note
  const targetKeywords = extractKeywords(targetNote.content);

  // Fetch all other user notes
  const otherNotes = await prisma.note.findMany({
    where: {
      userId,
      id: { not: noteId },
    },
    select: { id: true, content: true },
  });

  const SIMILARITY_THRESHOLD = 0.6;
  let created = 0;
  let updated = 0;

  for (const otherNote of otherNotes) {
    const otherKeywords = extractKeywords(otherNote.content);
    const similarity = calculateSimilarity(targetKeywords, otherKeywords);

      if (similarity >= SIMILARITY_THRESHOLD) {
        // Upsert the link (create or update strength)
      const existingLink = await prisma.noteLink.findUnique({
        where: {
          sourceId_targetId: {
            sourceId: noteId,
            targetId: otherNote.id,
          },
        },
      });

      if (existingLink) {
        // Only update if this is a semantic link (don't override explicit links)
        if (existingLink.linkType === "semantic") {
          await prisma.noteLink.update({
            where: { id: existingLink.id },
            data: { strength: similarity },
          });
          updated++;
        }
      } else {
        await prisma.noteLink.create({
          data: {
            sourceId: noteId,
            targetId: otherNote.id,
            strength: similarity,
            linkType: "semantic",
          },
        });
        created++;
      }
    }
  }

  // Also clean up links that are now below threshold
  await prisma.noteLink.deleteMany({
    where: {
      sourceId: noteId,
      linkType: "semantic",
      strength: { lt: SIMILARITY_THRESHOLD },
    },
  });

  return { created, updated };
}

/**
 * Get related notes for a given note, sorted by strength.
 * Includes both outgoing and incoming links.
 */
export async function getRelatedNotes(
  noteId: string,
  limit: number = 10,
  userId?: string
): Promise<NoteWithScore[]> {
  const effectiveUserId = userId ?? (await getCurrentUserId());
  const ownerFilter = ownerWhere(effectiveUserId);

  const ownedSource = await prisma.note.findFirst({
    where: { id: noteId, ...ownerFilter },
    select: { id: true },
  });
  if (!ownedSource) return [];

  // Fetch outgoing links
  const outgoingLinks = await prisma.noteLink.findMany({
    where: { sourceId: noteId, target: ownerFilter },
    include: {
      target: {
        include: {
          course: { select: { id: true, name: true, color: true } },
        },
      },
    },
    orderBy: { strength: "desc" },
    take: limit,
  });

  // Fetch incoming links
  const incomingLinks = await prisma.noteLink.findMany({
    where: { targetId: noteId, source: ownerFilter },
    include: {
      source: {
        include: {
          course: { select: { id: true, name: true, color: true } },
        },
      },
    },
    orderBy: { strength: "desc" },
    take: limit,
  });

  // Combine and deduplicate
  const noteMap = new Map<string, NoteWithScore>();

  for (const link of outgoingLinks) {
    if (!noteMap.has(link.targetId)) {
      const content = link.target.content;
      noteMap.set(link.targetId, {
        ...link.target,
        score: link.strength,
        linkType: link.linkType,
        contextSnippet: content.slice(0, 100) + (content.length > 100 ? "..." : ""),
      });
    }
  }

  for (const link of incomingLinks) {
    if (!noteMap.has(link.sourceId)) {
      const content = link.source.content;
      noteMap.set(link.sourceId, {
        ...link.source,
        score: link.strength,
        linkType: link.linkType,
        contextSnippet: content.slice(0, 100) + (content.length > 100 ? "..." : ""),
      });
    }
  }

  // Sort by score and return
  return Array.from(noteMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Create an explicit link between two notes.
 */
export async function createExplicitLink(
  sourceId: string,
  targetId: string
): Promise<void> {
  await prisma.noteLink.upsert({
    where: {
      sourceId_targetId: { sourceId, targetId },
    },
    update: {
      linkType: "explicit",
      strength: 1.0, // Explicit links have max strength
    },
    create: {
      sourceId,
      targetId,
      linkType: "explicit",
      strength: 1.0,
    },
  });
}

/**
 * Remove a link between two notes.
 */
export async function removeLink(
  sourceId: string,
  targetId: string
): Promise<void> {
  await prisma.noteLink.deleteMany({
    where: {
      sourceId,
      targetId,
    },
  });
}

/**
 * Regenerate all semantic links for a user's notes.
 * Useful for batch processing or initial setup.
 */
export async function regenerateAllLinks(
  userId: string
): Promise<{ totalLinks: number }> {
  // Get all user notes
  const notes = await prisma.note.findMany({
    where: { userId },
    select: { id: true, content: true },
  });

  // Clear existing semantic links
  await prisma.noteLink.deleteMany({
    where: {
      source: { userId },
      linkType: "semantic",
    },
  });

  // Extract keywords for all notes
  const noteKeywords = notes.map((note) => ({
    id: note.id,
    keywords: extractKeywords(note.content),
  }));

  const SIMILARITY_THRESHOLD = 0.6;
  let totalLinks = 0;

  // Compare all note pairs
  for (let i = 0; i < noteKeywords.length; i++) {
    for (let j = i + 1; j < noteKeywords.length; j++) {
      const similarity = calculateSimilarity(
        noteKeywords[i].keywords,
        noteKeywords[j].keywords
      );

      if (similarity >= SIMILARITY_THRESHOLD) {
        // Create link in both directions for bidirectional similarity
        await prisma.noteLink.createMany({
          data: [
            {
              sourceId: noteKeywords[i].id,
              targetId: noteKeywords[j].id,
              strength: similarity,
              linkType: "semantic",
            },
            {
              sourceId: noteKeywords[j].id,
              targetId: noteKeywords[i].id,
              strength: similarity,
              linkType: "semantic",
            },
          ],
          skipDuplicates: true,
        });
        totalLinks += 2;
      }
    }
  }

  return { totalLinks };
}

/**
 * Get graph data for visualization.
 * Returns nodes and edges for the note knowledge graph.
 */
export async function getNoteGraphData(
  userId: string,
  limit: number = 100
): Promise<NoteGraphData> {
  // Fetch notes with their link counts
  const notes = await prisma.note.findMany({
    where: { userId },
    include: {
      course: { select: { id: true, name: true, color: true } },
      _count: {
        select: {
          outgoingLinks: true,
          incomingLinks: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  // Create nodes
  const nodes: NoteGraphNode[] = notes.map((note) => ({
    id: note.id,
    label: note.content.slice(0, 30) + (note.content.length > 30 ? "..." : ""),
    courseName: note.course?.name || null,
    courseColor: note.course?.color || null,
    connectionCount: note._count.outgoingLinks + note._count.incomingLinks,
    lastReviewedAt: note.lastReviewedAt,
  }));

  // Fetch all links between these notes
  const noteIds = notes.map((n) => n.id);
  const links = await prisma.noteLink.findMany({
    where: {
      sourceId: { in: noteIds },
      targetId: { in: noteIds },
    },
    select: {
      sourceId: true,
      targetId: true,
      strength: true,
      linkType: true,
    },
  });

  // Create edges (deduplicate by using a set)
  const edgeSet = new Set<string>();
  const edges: NoteGraphEdge[] = [];

  for (const link of links) {
    const edgeKey = `${link.sourceId}-${link.targetId}`;
    if (!edgeSet.has(edgeKey)) {
      edgeSet.add(edgeKey);
      edges.push({
        source: link.sourceId,
        target: link.targetId,
        strength: link.strength,
        linkType: link.linkType,
      });
    }
  }

  return { nodes, edges };
}
