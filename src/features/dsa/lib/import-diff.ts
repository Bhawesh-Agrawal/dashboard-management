import type { DsaDifficultyValue } from "./schemas";
import type { InvalidImportRow, ParsedImportRow } from "./import-parser";

export interface ExistingTopicSnapshot {
  id: string;
  name: string;
  order: number;
}

export interface ExistingProblemSnapshot {
  id: string;
  topicId: string;
  topicName: string;
  subtopic: string;
  title: string;
  difficulty: DsaDifficultyValue | null;
  sourceUrl: string;
  platform: string;
  platformId: string | null;
  orderInTopic: number;
  tags: string[];
  importKey: string;
  archived: boolean;
}

export interface ImportDiffNewItem {
  rowNumber: number;
  importKey: string;
  topic: string;
  subtopic: string;
  title: string;
  difficulty: DsaDifficultyValue | null;
}

export interface ImportDiffUpdatedItem {
  id: string;
  rowNumber: number;
  importKey: string;
  topic: string;
  title: string;
  changedFields: string[];
}

export interface ImportDiffUnchangedItem {
  id: string;
  importKey: string;
  topic: string;
  title: string;
}

export interface ImportDiffMissingItem {
  id: string;
  importKey: string;
  topic: string;
  title: string;
}

export interface ImportDryRunPreview {
  totalParsed: number;
  newRows: ImportDiffNewItem[];
  updatedRows: ImportDiffUpdatedItem[];
  unchangedRows: ImportDiffUnchangedItem[];
  missingFromFile: ImportDiffMissingItem[];
  invalidRows: InvalidImportRow[];
  topicsInFileOrder: Array<{ name: string; isNew: boolean; order: number }>;
}

function sameTags(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Pure dry-run diff between parsed import rows and the user's current bank.
 * Never touches personal-progress columns or attempts.
 */
export function computeImportDiff(input: {
  validRows: ParsedImportRow[];
  invalidRows: InvalidImportRow[];
  topicOrder: string[];
  existingTopics: ExistingTopicSnapshot[];
  existingProblems: ExistingProblemSnapshot[];
}): ImportDryRunPreview {
  const existingTopicNames = new Set(input.existingTopics.map((t) => t.name));
  const existingByKey = new Map<string, ExistingProblemSnapshot>();
  for (const p of input.existingProblems) {
    existingByKey.set(p.importKey, p);
  }

  const newRows: ImportDiffNewItem[] = [];
  const updatedRows: ImportDiffUpdatedItem[] = [];
  const unchangedRows: ImportDiffUnchangedItem[] = [];
  const seenImportedKeys = new Set<string>();

  for (const row of input.validRows) {
    seenImportedKeys.add(row.importKey);
    const existing = existingByKey.get(row.importKey);
    if (!existing) {
      newRows.push({
        rowNumber: row.rowNumber,
        importKey: row.importKey,
        topic: row.topic,
        subtopic: row.subtopic,
        title: row.title,
        difficulty: row.difficulty,
      });
      continue;
    }

    const changedFields: string[] = [];
    if (existing.topicName !== row.topic) changedFields.push("topic");
    if (existing.subtopic !== row.subtopic) changedFields.push("subtopic");
    if (existing.title !== row.title) changedFields.push("title");
    if ((existing.difficulty ?? null) !== (row.difficulty ?? null)) changedFields.push("difficulty");
    if (existing.sourceUrl !== row.sourceUrl) changedFields.push("url");
    if (existing.platform !== row.platform) changedFields.push("platform");
    if ((existing.platformId ?? null) !== (row.platformId ?? null)) changedFields.push("platform_id");
    if (existing.orderInTopic !== row.orderInTopic) changedFields.push("order");
    if (!sameTags(existing.tags, row.tags)) changedFields.push("tags");
    if (existing.archived) changedFields.push("unarchive");

    if (changedFields.length > 0) {
      updatedRows.push({
        id: existing.id,
        rowNumber: row.rowNumber,
        importKey: row.importKey,
        topic: row.topic,
        title: row.title,
        changedFields,
      });
    } else {
      unchangedRows.push({
        id: existing.id,
        importKey: row.importKey,
        topic: row.topic,
        title: row.title,
      });
    }
  }

  const missingFromFile: ImportDiffMissingItem[] = [];
  for (const existing of input.existingProblems) {
    if (!existing.archived && !seenImportedKeys.has(existing.importKey)) {
      missingFromFile.push({
        id: existing.id,
        importKey: existing.importKey,
        topic: existing.topicName,
        title: existing.title,
      });
    }
  }

  const topicsInFileOrder = input.topicOrder.map((name, idx) => ({
    name,
    isNew: !existingTopicNames.has(name),
    order: idx + 1,
  }));

  return {
    totalParsed: input.validRows.length + input.invalidRows.length,
    newRows,
    updatedRows,
    unchangedRows,
    missingFromFile,
    invalidRows: input.invalidRows,
    topicsInFileOrder,
  };
}
