import { prisma } from "@/lib/prisma";
import type { KnowledgeGap, KnowledgeStats } from "@/types";

// ─── Graph Analysis Helpers ─────────────────────────────────

/**
 * Build an adjacency list from note links.
 */
function buildAdjacencyList(
  notes: { id: string }[],
  links: { sourceId: string; targetId: string }[]
): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();

  // Initialize all notes
  for (const note of notes) {
    adjacency.set(note.id, new Set());
  }

  // Add edges (bidirectional)
  for (const link of links) {
    const sourceNeighbors = adjacency.get(link.sourceId);
    const targetNeighbors = adjacency.get(link.targetId);

    if (sourceNeighbors) sourceNeighbors.add(link.targetId);
    if (targetNeighbors) targetNeighbors.add(link.sourceId);
  }

  return adjacency;
}

/**
 * Find connected components in the note graph using BFS.
 */
function findConnectedComponents(
  adjacency: Map<string, Set<string>>
): string[][] {
  const visited = new Set<string>();
  const components: string[][] = [];

  for (const startNode of adjacency.keys()) {
    if (visited.has(startNode)) continue;

    const component: string[] = [];
    const queue = [startNode];

    while (queue.length > 0) {
      const node = queue.shift()!;
      if (visited.has(node)) continue;

      visited.add(node);
      component.push(node);

      const neighbors = adjacency.get(node) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          queue.push(neighbor);
        }
      }
    }

    components.push(component);
  }

  return components;
}

// ─── Core Functions ─────────────────────────────────────────

/**
 * Detect knowledge gaps in the user's note graph.
 * Identifies:
 * - Orphan topics (notes with few connections)
 * - Missing connections between related notes
 * - Sparse areas in the knowledge graph
 */
export async function detectKnowledgeGaps(
  userId: string
): Promise<KnowledgeGap[]> {
  const gaps: KnowledgeGap[] = [];

  // Fetch all user notes with links
  const [notes, links] = await Promise.all([
    prisma.note.findMany({
      where: { userId },
      select: {
        id: true,
        content: true,
        tags: true,
        courseId: true,
        createdAt: true,
      },
    }),
    prisma.noteLink.findMany({
      where: {
        source: { userId },
        linkType: "semantic",
      },
      select: {
        sourceId: true,
        targetId: true,
      },
    }),
  ]);

  if (notes.length === 0) return gaps;

  // Build adjacency list
  const adjacency = buildAdjacencyList(notes, links);

  // Find connected components
  const components = findConnectedComponents(adjacency);

  // 1. Detect orphan notes (0-1 connections)
  for (const note of notes) {
    const connectionCount = adjacency.get(note.id)?.size || 0;

    if (connectionCount <= 1) {
      gaps.push({
        type: "orphan_topic",
        description: `Note has ${connectionCount === 0 ? "no" : "only 1"} connection${connectionCount !== 1 ? "s" : ""}. Consider linking it to related notes.`,
        relatedNoteIds: [note.id],
        suggestedTopics: [],
        severity: connectionCount === 0 ? "high" : "medium",
      });
    }
  }

  // 2. Detect sparse areas (small disconnected components)
  for (const component of components) {
    if (component.length >= 2 && component.length <= 3) {
      // Small isolated cluster
      gaps.push({
        type: "sparse_area",
        description: `A cluster of ${component.length} notes exists in isolation. Consider connecting it to other knowledge areas.`,
        relatedNoteIds: component,
        suggestedTopics: [],
        severity: "medium",
      });
    }
  }

  // 3. Detect missing connections based on tags
  const tagGroups = new Map<string, string[]>();
  for (const note of notes) {
    for (const tag of note.tags) {
      const normalizedTag = tag.toLowerCase();
      if (!tagGroups.has(normalizedTag)) {
        tagGroups.set(normalizedTag, []);
      }
      tagGroups.get(normalizedTag)!.push(note.id);
    }
  }

  // Check for notes with same tags but no links
  for (const [tag, noteIds] of tagGroups) {
    if (noteIds.length >= 2) {
      // Check if these notes are already connected
      const connectedPairs = new Set<string>();
      for (const link of links) {
        if (noteIds.includes(link.sourceId) && noteIds.includes(link.targetId)) {
          connectedPairs.add(`${link.sourceId}-${link.targetId}`);
          connectedPairs.add(`${link.targetId}-${link.sourceId}`);
        }
      }

      // Find unconnected pairs
      const unconnected: string[] = [];
      for (let i = 0; i < noteIds.length; i++) {
        for (let j = i + 1; j < noteIds.length; j++) {
          if (!connectedPairs.has(`${noteIds[i]}-${noteIds[j]}`)) {
            unconnected.push(noteIds[i], noteIds[j]);
          }
        }
      }

      if (unconnected.length > 0) {
        gaps.push({
          type: "missing_connection",
          description: `Notes tagged "${tag}" are not connected. They may be related.`,
          relatedNoteIds: [...new Set(unconnected)].slice(0, 5),
          suggestedTopics: [tag],
          severity: "low",
        });
      }
    }
  }

  // Limit total gaps returned
  return gaps.slice(0, 20);
}

/**
 * Get knowledge graph statistics for the dashboard.
 */
export async function getKnowledgeStats(
  userId: string
): Promise<KnowledgeStats> {
  const [noteCount, connectionCount, notes] = await Promise.all([
    prisma.note.count({ where: { userId } }),
    prisma.noteLink.count({
      where: {
        source: { userId },
        linkType: "semantic",
      },
    }),
    prisma.note.findMany({
      where: { userId },
      select: {
        id: true,
        tags: true,
        lastReviewedAt: true,
        reviewCount: true,
      },
    }),
  ]);

  // Calculate reviews due
  const REVIEW_INTERVALS = [1, 3, 7, 14, 30];
  const reviewsDue = notes.filter((note) => {
    if (!note.lastReviewedAt) return true;
    const intervalDays =
      REVIEW_INTERVALS[Math.min(note.reviewCount, REVIEW_INTERVALS.length - 1)];
    const nextReviewDate = new Date(note.lastReviewedAt);
    nextReviewDate.setDate(nextReviewDate.getDate() + intervalDays);
    return new Date() >= nextReviewDate;
  }).length;

  // Find top clusters by tag frequency
  const tagCounts = new Map<string, number>();
  for (const note of notes) {
    for (const tag of note.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }

  const topClusters = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([topic, noteCount]) => ({ topic, noteCount }));

  // Get gap count (simplified - just count orphans)
  const links = await prisma.noteLink.findMany({
    where: {
      source: { userId },
      linkType: "semantic",
    },
    select: { sourceId: true },
  });

  const connectedNotes = new Set(links.map((l) => l.sourceId));
  const gapCount = notes.filter((n) => !connectedNotes.has(n.id)).length;

  return {
    noteCount,
    connectionCount,
    gapCount,
    reviewsDue,
    topClusters,
  };
}

/**
 * Pre-compute and cache knowledge gaps for a user.
 * Called by cron job to keep gap data fresh.
 */
export async function precomputeKnowledgeGaps(
  userId: string
): Promise<{ gaps: KnowledgeStats; computedAt: Date }> {
  const stats = await getKnowledgeStats(userId);

  // Store stats in a cache-like structure (using a simple JSON field)
  // For now, we just return the computed stats
  // In a production system, you might store this in a separate table
  return {
    gaps: stats,
    computedAt: new Date(),
  };
}
