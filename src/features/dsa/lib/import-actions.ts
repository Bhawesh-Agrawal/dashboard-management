"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getNow } from "@/lib/clock";
import { requireDsaUserId } from "./ownership";
import { parseQuestionBankInput } from "./import-parser";
import { computeImportDiff, type ImportDryRunPreview } from "./import-diff";
import { dsaParseDate, dsaToday, DSA_DEFAULT_TIMEZONE } from "./time";

const ImportPayloadSchema = z.object({
  content: z.string().min(1, "Import content is required").max(2_000_000),
  format: z.enum(["csv", "json", "text"]),
});

export type ImportPayloadInput = z.infer<typeof ImportPayloadSchema>;

export interface ConfirmImportResult {
  ok: boolean;
  error?: string;
  created: number;
  updated: number;
  unchanged: number;
  archived: number;
  topicsCreated: number;
}

async function loadExistingForImport(userId: string) {
  const [topics, problems] = await Promise.all([
    prisma.dsaTopic.findMany({
      where: { userId },
      orderBy: { order: "asc" },
      select: { id: true, name: true, order: true },
    }),
    prisma.dsaProblem.findMany({
      where: { userId },
      include: { topic: { select: { name: true } } },
    }),
  ]);

  return {
    topics,
    problems: problems.map((p) => ({
      id: p.id,
      topicId: p.topicId,
      topicName: p.topic.name,
      subtopic: p.subtopic,
      title: p.title,
      difficulty: p.difficulty,
      sourceUrl: p.sourceUrl,
      platform: p.platform,
      platformId: p.platformId,
      orderInTopic: p.orderInTopic,
      tags: p.tags,
      importKey: p.importKey,
      archived: p.archived,
    })),
  };
}

/**
 * Dry-run preview for CSV / JSON / pasted CSV/TSV question bank imports.
 * Never mutates the database.
 */
export async function previewDsaImport(
  input: ImportPayloadInput
): Promise<ImportDryRunPreview> {
  const validated = ImportPayloadSchema.parse(input);
  const userId = await requireDsaUserId();
  const parsed = parseQuestionBankInput(validated.content, validated.format);
  const existing = await loadExistingForImport(userId);

  return computeImportDiff({
    validRows: parsed.validRows,
    invalidRows: parsed.invalidRows,
    topicOrder: parsed.topicOrder,
    existingTopics: existing.topics,
    existingProblems: existing.problems,
  });
}

/**
 * Explicit confirm import.
 * Transactional, idempotent, preserves personal-progress columns and attempts,
 * archives missing problems instead of deleting them, and keeps topics with attempts.
 */
export async function confirmDsaImport(
  input: ImportPayloadInput
): Promise<ConfirmImportResult> {
  const validated = ImportPayloadSchema.parse(input);
  const userId = await requireDsaUserId();
  const parsed = parseQuestionBankInput(validated.content, validated.format);

  if (parsed.invalidRows.length > 0) {
    return {
      ok: false,
      error: `Found ${parsed.invalidRows.length} invalid row(s). Fix them before confirming import.`,
      created: 0,
      updated: 0,
      unchanged: 0,
      archived: 0,
      topicsCreated: 0,
    };
  }

  if (parsed.validRows.length === 0) {
    return {
      ok: false,
      error: "No valid problems found to import.",
      created: 0,
      updated: 0,
      unchanged: 0,
      archived: 0,
      topicsCreated: 0,
    };
  }

  const existing = await loadExistingForImport(userId);
  const diff = computeImportDiff({
    validRows: parsed.validRows,
    invalidRows: parsed.invalidRows,
    topicOrder: parsed.topicOrder,
    existingTopics: existing.topics,
    existingProblems: existing.problems,
  });

  const validByKey = new Map(parsed.validRows.map((r) => [r.importKey, r]));
  const existingTopicByName = new Map(existing.topics.map((t) => [t.name, t]));
  const topicOrderIndex = new Map(parsed.topicOrder.map((name, idx) => [name, idx + 1]));

  let topicsCreated = 0;

  await prisma.$transaction(
    async (tx) => {
      const resolvedTopicIds = new Map<string, string>();

      // 1. Batch-create missing topics in a single query and update order for changed existing topics
      const missingNewTopics = parsed.topicOrder.filter(
        (name) => !existingTopicByName.has(name)
      );
      if (missingNewTopics.length > 0) {
        const createdTopics = await tx.dsaTopic.createManyAndReturn({
          data: missingNewTopics.map((topicName) => ({
            userId,
            name: topicName,
            order: topicOrderIndex.get(topicName)!,
          })),
          select: { id: true, name: true },
        });
        for (const ct of createdTopics) {
          resolvedTopicIds.set(ct.name, ct.id);
        }
        topicsCreated = createdTopics.length;
      }

      const topicOrderUpdates: Array<{ id: string; order: number }> = [];
      for (const topicName of parsed.topicOrder) {
        const existingTopic = existingTopicByName.get(topicName);
        if (existingTopic) {
          resolvedTopicIds.set(topicName, existingTopic.id);
          const order = topicOrderIndex.get(topicName)!;
          if (existingTopic.order !== order) {
            topicOrderUpdates.push({ id: existingTopic.id, order });
          }
        }
      }

      if (topicOrderUpdates.length > 0) {
        await Promise.all(
          topicOrderUpdates.map((u) =>
            tx.dsaTopic.update({ where: { id: u.id }, data: { order: u.order } })
          )
        );
      }

      // 2. Keep any pre-existing topics not in the file (placed after file topics),
      //    preserving attempts and archived problems; delete only if completely empty with 0 problems/attempts.
      let trailingOrder = parsed.topicOrder.length + 1;
      const missingTopics = existing.topics.filter((t) => !topicOrderIndex.has(t.name));
      if (missingTopics.length > 0) {
        const problemCounts = await tx.dsaProblem.groupBy({
          by: ["topicId"],
          where: { userId, topicId: { in: missingTopics.map((t) => t.id) } },
          _count: { _all: true },
        });
        const countByTopicId = new Map(
          problemCounts.map((r) => [r.topicId, r._count._all])
        );
        const emptyIds: string[] = [];
        const trailingUpdates: Array<{ id: string; order: number }> = [];
        for (const topic of missingTopics) {
          if ((countByTopicId.get(topic.id) ?? 0) === 0) {
            emptyIds.push(topic.id);
          } else {
            if (topic.order !== trailingOrder) {
              trailingUpdates.push({ id: topic.id, order: trailingOrder });
            }
            trailingOrder++;
          }
        }
        if (emptyIds.length > 0) {
          await tx.dsaTopic.deleteMany({ where: { userId, id: { in: emptyIds } } });
        }
        if (trailingUpdates.length > 0) {
          await Promise.all(
            trailingUpdates.map((u) =>
              tx.dsaTopic.update({ where: { id: u.id }, data: { order: u.order } })
            )
          );
        }
      }

      // 3. Create new problems (bank columns only)
      if (diff.newRows.length > 0) {
        await tx.dsaProblem.createMany({
          data: diff.newRows.map((item) => {
            const row = validByKey.get(item.importKey)!;
            return {
              userId,
              topicId: resolvedTopicIds.get(row.topic)!,
              subtopic: row.subtopic,
              title: row.title,
              difficulty: row.difficulty,
              sourceUrl: row.sourceUrl,
              platform: row.platform,
              platformId: row.platformId,
              orderInTopic: row.orderInTopic,
              tags: row.tags,
              importKey: row.importKey,
              archived: false,
            };
          }),
        });
      }

      // 4. Update changed problems (ONLY bank columns; NEVER touch personal-progress columns or attempts)
      const CHUNK_SIZE = 25;
      for (let i = 0; i < diff.updatedRows.length; i += CHUNK_SIZE) {
        const batch = diff.updatedRows.slice(i, i + CHUNK_SIZE);
        await Promise.all(
          batch.map((item) => {
            const row = validByKey.get(item.importKey)!;
            return tx.dsaProblem.update({
              where: { id: item.id },
              data: {
                topicId: resolvedTopicIds.get(row.topic)!,
                subtopic: row.subtopic,
                title: row.title,
                difficulty: row.difficulty,
                sourceUrl: row.sourceUrl,
                platform: row.platform,
                platformId: row.platformId,
                orderInTopic: row.orderInTopic,
                tags: row.tags,
                archived: false,
              },
            });
          })
        );
      }

      // 5. Archive problems missing from file (never delete)
      if (diff.missingFromFile.length > 0) {
        await tx.dsaProblem.updateMany({
          where: {
            userId,
            id: { in: diff.missingFromFile.map((m) => m.id) },
          },
          data: { archived: true },
        });
      }

      // 6. Ensure DsaSettings exists and set currentTopicId if unset
      const firstTopicId =
        parsed.topicOrder.length > 0 ? resolvedTopicIds.get(parsed.topicOrder[0]) ?? null : null;
      const settings = await tx.dsaSettings.findUnique({ where: { userId } });
      if (!settings) {
        await tx.dsaSettings.create({
          data: {
            userId,
            programmeStartDate: dsaParseDate(dsaToday(getNow(), DSA_DEFAULT_TIMEZONE)),
            programmeLengthDays: 90,
            phases: [],
            currentTopicId: firstTopicId,
          },
        });
      } else if (!settings.currentTopicId && firstTopicId) {
        await tx.dsaSettings.update({
          where: { userId },
          data: { currentTopicId: firstTopicId },
        });
      }
    },
    { maxWait: 10_000, timeout: 60_000 }
  );

  revalidatePath("/dsa");
  revalidatePath("/dsa/topics");
  revalidatePath("/dsa/problems");
  revalidatePath("/dsa/settings");

  return {
    ok: true,
    created: diff.newRows.length,
    updated: diff.updatedRows.length,
    unchanged: diff.unchangedRows.length,
    archived: diff.missingFromFile.length,
    topicsCreated,
  };
}
