"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { IdentityStatus } from "@prisma/client";

// ─── CRUD ───────────────────────────────────────────────────

export async function getIdentities(userId: string) {
  return prisma.identity.findMany({
    where: { userId },
    include: { routines: true },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
}

export async function getIdentity(id: string) {
  return prisma.identity.findUnique({
    where: { id },
    include: {
      routines: {
        include: {
          completions: {
            orderBy: { date: "desc" },
            take: 30,
          },
        },
      },
    },
  });
}

export async function createIdentity(data: {
  userId: string;
  statement: string;
  description?: string;
  status?: IdentityStatus;
  color?: string;
  icon?: string;
}) {
  const identity = await prisma.identity.create({
    data: {
      userId: data.userId,
      statement: data.statement,
      description: data.description,
      status: data.status ?? "aspirational",
      color: data.color,
      icon: data.icon,
    },
  });
  revalidatePath("/routines");
  return identity;
}

export async function updateIdentity(
  id: string,
  data: {
    statement?: string;
    description?: string;
    status?: IdentityStatus;
    color?: string;
    icon?: string;
  }
) {
  const identity = await prisma.identity.update({
    where: { id },
    data,
  });
  revalidatePath("/routines");
  revalidatePath(`/routines/identities/${id}`);
  return identity;
}

export async function deleteIdentity(id: string) {
  // Unlink routines before deleting
  await prisma.routine.updateMany({
    where: { identityId: id },
    data: { identityId: null },
  });
  await prisma.identity.delete({ where: { id } });
  revalidatePath("/routines");
}

// ─── Progress Calculation ───────────────────────────────────

export type IdentityProgress = {
  identity: {
    id: string;
    statement: string;
    description: string | null;
    status: IdentityStatus;
    color: string | null;
    icon: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  strength: number;
  trend: "up" | "down" | "stable";
  relatedRoutines: {
    id: string;
    name: string;
    timeOfDay: string;
    activeDays: string[];
    completions: { date: Date }[];
  }[];
  lastActivity: Date | null;
  daysSinceLastActivity: number | null;
};

const stopWords = new Set([
  "i", "am", "a", "an", "the", "is", "are", "was", "were", "be",
  "been", "being", "have", "has", "had", "do", "does", "did", "will",
  "would", "could", "should", "may", "might", "shall", "can", "to",
  "of", "in", "for", "on", "with", "at", "by", "from", "as", "into",
  "through", "during", "before", "after", "above", "below", "between",
]);

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
}

export async function getIdentityProgress(
  userId: string
): Promise<IdentityProgress[]> {
  try {
    const identities = await prisma.identity.findMany({
      where: { userId },
      include: {
        routines: {
          include: {
            completions: {
              where: {
                date: {
                  gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                },
              },
              orderBy: { date: "desc" },
            },
          },
        },
      },
    });

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const twentyEightDaysAgo = new Date(
      now.getTime() - 28 * 24 * 60 * 60 * 1000
    );

    // Fetch tasks and notes for keyword matching
    const [tasks, notes] = await Promise.all([
      prisma.task.findMany({
        where: {
          userId,
          createdAt: { gte: thirtyDaysAgo },
        },
        select: { title: true, status: true, createdAt: true },
      }),
      prisma.note.findMany({
        where: {
          userId,
          createdAt: { gte: thirtyDaysAgo },
        },
        select: { tags: true, createdAt: true },
      }),
    ]);

    const results: IdentityProgress[] = [];

    for (const identity of identities) {
      const keywords = extractKeywords(identity.statement);

      // 1. Routine adherence (50% weight)
      let routineAdherence = 0;
      if (identity.routines.length > 0) {
        const totalPossible = identity.routines.reduce((sum, r) => {
          const days = r.activeDays.length;
          return sum + Math.ceil((30 * days) / 7);
        }, 0);
        const completed = identity.routines.reduce(
          (sum, r) => sum + r.completions.length,
          0
        );
        routineAdherence = totalPossible > 0 ? (completed / totalPossible) * 100 : 0;
      }

      // 2. Task completion (30% weight)
      let taskCompletion = 0;
      if (keywords.length > 0) {
        const matchedTasks = tasks.filter((t) =>
          keywords.some(
            (kw) =>
              t.title.toLowerCase().includes(kw)
          )
        );
        if (matchedTasks.length > 0) {
          const done = matchedTasks.filter((t) => t.status === "done").length;
          taskCompletion = (done / matchedTasks.length) * 100;
        }
      }

      // 3. Note activity (20% weight)
      let noteActivity = 0;
      if (keywords.length > 0) {
        const matchedNotes = notes.filter((n) =>
          n.tags.some((tag) =>
            keywords.some((kw) => tag.toLowerCase().includes(kw))
          )
        );
        // Scale: 1 note = 25%, 4+ notes = 100%
        noteActivity = Math.min(matchedNotes.length * 25, 100);
      }

      // Weighted composite
      const strength = Math.round(
        routineAdherence * 0.5 + taskCompletion * 0.3 + noteActivity * 0.2
      );

      // Trend: compare last 14 days vs prior 14 days
      const recentCompletions = identity.routines.flatMap((r) =>
        r.completions.filter((c) => c.date >= fourteenDaysAgo)
      ).length;
      const priorCompletions = identity.routines.flatMap((r) =>
        r.completions.filter(
          (c) => c.date >= twentyEightDaysAgo && c.date < fourteenDaysAgo
        )
      ).length;

      let trend: "up" | "down" | "stable" = "stable";
      const diff = recentCompletions - priorCompletions;
      if (diff > 1) trend = "up";
      else if (diff < -1) trend = "down";

      // Last activity
      const allCompletions = identity.routines.flatMap((r) => r.completions);
      const lastActivity =
        allCompletions.length > 0
          ? allCompletions.reduce((latest, c) =>
              c.date > latest.date ? c : latest
            ).date
          : null;

      results.push({
        identity: {
          id: identity.id,
          statement: identity.statement,
          description: identity.description,
          status: identity.status,
          color: identity.color,
          icon: identity.icon,
          createdAt: identity.createdAt,
          updatedAt: identity.updatedAt,
        },
        strength: Math.min(strength, 100),
        trend,
        relatedRoutines: identity.routines.map((r) => ({
          id: r.id,
          name: r.name,
          timeOfDay: r.timeOfDay,
          activeDays: r.activeDays,
          completions: r.completions.map((c) => ({ date: c.date })),
        })),
        lastActivity,
        daysSinceLastActivity: lastActivity
          ? Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24))
          : null,
      });
    }

    // Sort by strength descending
    results.sort((a, b) => b.strength - a.strength);

    return results;
  } catch (error) {
    console.error("Failed to fetch identity progress:", error);
    return [];
  }
}
