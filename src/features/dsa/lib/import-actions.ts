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

  await prisma.$transaction(async (tx) => {
    const resolvedTopicIds = new Map<string, string>();

    // 1. Upsert/order topics present in the file in file order
    for (const topicName of parsed.topicOrder) {
      const order = topicOrderIndex.get(topicName)!;
      const existingTopic = existingTopicByName.get(topicName);
      if (!existingTopic) {
        const created = await tx.dsaTopic.create({
          data: {
            userId,
            name: topicName,
            order,
          },
        });
        resolvedTopicIds.set(topicName, created.id);
        topicsCreated++;
      } else {
        resolvedTopicIds.set(topicName, existingTopic.id);
        if (existingTopic.order !== order) {
          await tx.dsaTopic.update({
            where: { id: existingTopic.id },
            data: { order },
          });
        }
      }
    }

    // 2. Keep any pre-existing topics not in the file (placed after file topics),
    //    preserving attempts and archived problems; delete only if completely empty with 0 problems/attempts.
    let trailingOrder = parsed.topicOrder.length + 1;
    const missingTopics = existing.topics.filter((t) => !topicOrderIndex.has(t.name));
    for (const topic of missingTopics) {
      const problemCount = await tx.dsaProblem.count({
        where: { userId, topicId: topic.id },
      });
      if (problemCount === 0) {
        await tx.dsaTopic.delete({ where: { id: topic.id } });
      } else {
        if (topic.order !== trailingOrder) {
          await tx.dsaTopic.update({
            where: { id: topic.id },
            data: { order: trailingOrder },
          });
        }
        trailingOrder++;
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
    for (const item of diff.updatedRows) {
      const row = validByKey.get(item.importKey)!;
      await tx.dsaProblem.update({
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
  });

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
