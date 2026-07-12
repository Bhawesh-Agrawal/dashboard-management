import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import type { Note } from "@prisma/client";

// ─── Review Intervals ───────────────────────────────────────
// Days between reviews: 1, 3, 7, 14, 30
const REVIEW_INTERVALS = [1, 3, 7, 14, 30];

// ─── Types ──────────────────────────────────────────────────
export type NoteForReview = Note & {
  course: { id: string; name: string; color: string | null } | null;
  connectionCount: number;
};

// ─── Helper Functions ───────────────────────────────────────

/**
 * Calculate the next review interval based on review count.
 * Returns the number of days until the next review.
 */
function getNextReviewInterval(reviewCount: number): number {
  // Use the review count to determine interval, capping at the last interval
  const intervalIndex = Math.min(reviewCount, REVIEW_INTERVALS.length - 1);
  return REVIEW_INTERVALS[intervalIndex];
}

/**
 * Check if a note is due for review based on its last review time.
 */
function isDueForReview(note: {
  lastReviewedAt: Date | null;
  reviewCount: number;
}): boolean {
  if (!note.lastReviewedAt) return true;

  const intervalDays = getNextReviewInterval(note.reviewCount);
  const nextReviewDate = new Date(note.lastReviewedAt);
  nextReviewDate.setDate(nextReviewDate.getDate() + intervalDays);

  return new Date() >= nextReviewDate;
}

// ─── Core Functions ─────────────────────────────────────────

/**
 * Get notes due for daily review.
 * Prioritizes:
 * 1. Notes with high connection count (hubs in knowledge graph)
 * 2. Notes that haven't been reviewed in a while
 * 3. Notes with high semantic strength scores
 */
export async function getNotesForReview(
  userId: string,
  limit: number = 5
): Promise<NoteForReview[]> {
  // Fetch all user notes with connection counts
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
  });

  // Filter to notes that are due for review
  const dueNotes = notes.filter((note) =>
    isDueForReview({
      lastReviewedAt: note.lastReviewedAt,
      reviewCount: note.reviewCount,
    })
  );

  // Sort by priority score
  const scoredNotes = dueNotes.map((note) => {
    const connectionCount = note._count.outgoingLinks + note._count.incomingLinks;

    // Priority score: higher = more important to review
    // Factors:
    // - Connection count (more connections = more important hub)
    // - Time since last review (longer = more urgent)
    // - Review count (fewer reviews = more important to reinforce)

    let priorityScore = 0;

    // Connection score (0-5 points)
    priorityScore += Math.min(connectionCount, 5);

    // Recency score (0-5 points)
    if (note.lastReviewedAt) {
      const daysSinceReview = Math.floor(
        (Date.now() - note.lastReviewedAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      priorityScore += Math.min(Math.floor(daysSinceReview / 7), 5);
    } else {
      // Never reviewed = highest priority
      priorityScore += 5;
    }

    // Reinforcement score (0-3 points) - less reviewed = higher priority
    priorityScore += Math.max(0, 3 - note.reviewCount);

    return {
      ...note,
      connectionCount,
      priorityScore,
    };
  });

  // Sort by priority score descending and return top N
  return scoredNotes
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, limit)
    .map(({ connectionCount, priorityScore: _score, ...rest }) => ({
      ...rest,
      connectionCount,
    }));
}

/**
 * Mark a note as reviewed.
 * Updates the lastReviewedAt timestamp and increments reviewCount.
 */
export async function markNoteReviewed(noteId: string): Promise<void> {
  const userId = await getCurrentUserId();

  // Verify the note belongs to the user
  const note = await prisma.note.findUnique({
    where: { id: noteId },
    select: { userId: true },
  });

  if (!note || note.userId !== userId) {
    throw new Error("Note not found or access denied");
  }

  await prisma.note.update({
    where: { id: noteId },
    data: {
      lastReviewedAt: new Date(),
      reviewCount: { increment: 1 },
    },
  });
}

/**
 * Get review statistics for the dashboard.
 */
export async function getReviewStats(userId: string): Promise<{
  totalNotes: number;
  notesDueToday: number;
  notesReviewedThisWeek: number;
  averageReviewCount: number;
}> {
  const notes = await prisma.note.findMany({
    where: { userId },
    select: {
      id: true,
      lastReviewedAt: true,
      reviewCount: true,
    },
  });

  const totalNotes = notes.length;

  const notesDueToday = notes.filter((note) =>
    isDueForReview({
      lastReviewedAt: note.lastReviewedAt,
      reviewCount: note.reviewCount,
    })
  ).length;

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const notesReviewedThisWeek = notes.filter(
    (note) => note.lastReviewedAt && note.lastReviewedAt >= oneWeekAgo
  ).length;

  const averageReviewCount =
    notes.length > 0
      ? notes.reduce((sum, note) => sum + note.reviewCount, 0) / notes.length
      : 0;

  return {
    totalNotes,
    notesDueToday,
    notesReviewedThisWeek,
    averageReviewCount: Math.round(averageReviewCount * 10) / 10,
  };
}

/**
 * Reset review history for a note.
 * Useful if a note's content changes significantly.
 */
export async function resetNoteReview(noteId: string): Promise<void> {
  const userId = await getCurrentUserId();

  const note = await prisma.note.findUnique({
    where: { id: noteId },
    select: { userId: true },
  });

  if (!note || note.userId !== userId) {
    throw new Error("Note not found or access denied");
  }

  await prisma.note.update({
    where: { id: noteId },
    data: {
      lastReviewedAt: null,
      reviewCount: 0,
    },
  });
}
