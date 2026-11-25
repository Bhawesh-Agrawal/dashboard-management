import { z } from "zod";
import { DSA_DIFFICULTIES, type DsaDifficultyValue } from "./schemas";

export interface ParsedImportRow {
  rowNumber: number;
  topic: string;
  subtopic: string;
  title: string;
  difficulty: DsaDifficultyValue | null;
  sourceUrl: string;
  platform: string;
  platformId: string | null;
  orderInTopic: number;
  tags: string[];
  importKey: string;
}

export interface InvalidImportRow {
  rowNumber: number;
  rawTitle: string;
  reason: string;
}

export interface ParseImportResult {
  validRows: ParsedImportRow[];
  invalidRows: InvalidImportRow[];
  topicOrder: string[];
}

const UrlSchema = z
  .string()
  .url("Invalid URL")
  .refine((u) => u.startsWith("http://") || u.startsWith("https://"), {
    message: "URL must start with http:// or https://",
  });

function normalizeKeyPart(val: string): string {
  return val.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Computes the stable import key in required match order:
 * 1. explicit import_key
 * 2. platform:platform_id
 * 3. normalized "topic|title"
 */
export function computeImportKey(input: {
  importKey?: string | null;
  platform?: string | null;
  platformId?: string | null;
  topic: string;
  title: string;
}): string {
  const explicit = input.importKey?.trim();
  if (explicit) return explicit;

  const platform = input.platform?.trim().toLowerCase();
  const platformId = input.platformId?.trim();
  if (platform && platformId) {
    return `${platform}:${platformId}`;
  }

  return `${normalizeKeyPart(input.topic)}|${normalizeKeyPart(input.title)}`;
}

/**
 * Splits a delimited text (CSV or TSV) into rows of string cells,
 * handling RFC-4180 quoted cells and escaped double quotes.
 */
function parseDelimitedText(text: string): string[][] {
  const cleaned = text.replace(/^\uFEFF/, "").trim();
  if (!cleaned) return [];

  // Detect delimiter from first non-empty line: TSV if tabs present and no/fewer commas
  const firstLineEnd = cleaned.search(/\r?\n/);
  const firstLine = firstLineEnd === -1 ? cleaned : cleaned.slice(0, firstLineEnd);
  const tabCount = (firstLine.match(/\t/g) ?? []).length;
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  const delimiter = tabCount > 0 && tabCount >= commaCount ? "\t" : ",";

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    const next = cleaned[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentCell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentCell += ch;
      }
      continue;
    }

    if (ch === '"' && currentCell === "") {
      inQuotes = true;
    } else if (ch === delimiter) {
      currentRow.push(currentCell);
      currentCell = "";
    } else if (ch === "\r" && next === "\n") {
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      i++;
    } else if (ch === "\n" || ch === "\r") {
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
    } else {
      currentCell += ch;
    }
  }

  currentRow.push(currentCell);
  if (currentRow.some((cell) => cell.trim() !== "")) {
    rows.push(currentRow);
  }

  return rows;
}

const HEADER_ALIASES: Record<string, string> = {
  topic: "topic",
  subtopic: "subtopic",
  sub_topic: "subtopic",
  title: "title",
  problem: "title",
  name: "title",
  difficulty: "difficulty",
  url: "url",
  source_url: "url",
  sourceurl: "url",
  link: "url",
  platform: "platform",
  platform_id: "platform_id",
  platformid: "platform_id",
  order: "order",
  order_in_topic: "order",
  orderintopic: "order",
  tags: "tags",
  import_key: "import_key",
  importkey: "import_key",
};

function normalizeHeader(h: string): string {
  const key = h.trim().toLowerCase().replace(/\s+/g, "_");
  return HEADER_ALIASES[key] ?? key;
}

function validateAndBuildRow(
  raw: Record<string, unknown>,
  rowNumber: number,
  perTopicAutoOrder: Map<string, number>,
  seenKeys: Set<string>
): { valid?: ParsedImportRow; invalid?: InvalidImportRow } {
  const topicRaw = typeof raw.topic === "string" ? raw.topic.trim() : String(raw.topic ?? "").trim();
  const titleRaw = typeof raw.title === "string" ? raw.title.trim() : String(raw.title ?? "").trim();
  const rawTitle = titleRaw || `(Row ${rowNumber})`;

  if (!topicRaw) {
    return { invalid: { rowNumber, rawTitle, reason: "Missing required column: topic" } };
  }
  if (!titleRaw) {
    return { invalid: { rowNumber, rawTitle, reason: "Missing required column: title" } };
  }

  // Difficulty
  let difficulty: DsaDifficultyValue | null = null;
  const diffRaw = raw.difficulty == null ? "" : String(raw.difficulty).trim().toLowerCase();
  if (diffRaw !== "") {
    if ((DSA_DIFFICULTIES as readonly string[]).includes(diffRaw)) {
      difficulty = diffRaw as DsaDifficultyValue;
    } else {
      return {
        invalid: {
          rowNumber,
          rawTitle,
          reason: `Invalid difficulty "${raw.difficulty}". Expected easy, medium, hard, or blank.`,
        },
      };
    }
  }

  // URL
  const urlRaw = raw.url == null ? "" : String(raw.url).trim();
  if (urlRaw !== "") {
    const urlCheck = UrlSchema.safeParse(urlRaw);
    if (!urlCheck.success) {
      return {
        invalid: {
          rowNumber,
          rawTitle,
          reason: urlCheck.error.issues[0]?.message ?? "Invalid url",
        },
      };
    }
  }

  // Order
  let orderInTopic: number;
  const orderRaw = raw.order == null ? "" : String(raw.order).trim();
  if (orderRaw === "") {
    const nextOrder = (perTopicAutoOrder.get(topicRaw) ?? 0) + 1;
    perTopicAutoOrder.set(topicRaw, nextOrder);
    orderInTopic = nextOrder;
  } else {
    const parsedOrder = Number(orderRaw);
    if (!Number.isInteger(parsedOrder) || parsedOrder < 0) {
      return {
        invalid: {
          rowNumber,
          rawTitle,
          reason: `Invalid order "${orderRaw}". Must be a non-negative integer.`,
        },
      };
    }
    orderInTopic = parsedOrder;
    const prevMax = perTopicAutoOrder.get(topicRaw) ?? 0;
    if (parsedOrder > prevMax) perTopicAutoOrder.set(topicRaw, parsedOrder);
  }

  // Tags
  let tags: string[] = [];
  if (Array.isArray(raw.tags)) {
    tags = Array.from(
      new Set(
        raw.tags
          .map((t) => String(t).trim())
          .filter(Boolean)
      )
    );
  } else if (raw.tags != null) {
    tags = Array.from(
      new Set(
        String(raw.tags)
          .split(";")
          .map((t) => t.trim())
          .filter(Boolean)
      )
    );
  }

  const subtopic = raw.subtopic == null ? "" : String(raw.subtopic).trim();
  const platform = raw.platform == null ? "" : String(raw.platform).trim();
  const platformIdRaw = raw.platform_id == null ? "" : String(raw.platform_id).trim();
  const platformId = platformIdRaw === "" ? null : platformIdRaw;
  const importKeyRaw = raw.import_key == null ? "" : String(raw.import_key).trim();

  const importKey = computeImportKey({
    importKey: importKeyRaw,
    platform,
    platformId,
    topic: topicRaw,
    title: titleRaw,
  });

  if (seenKeys.has(importKey)) {
    return {
      invalid: {
        rowNumber,
        rawTitle,
        reason: `Duplicate import key "${importKey}" in input`,
      },
    };
  }
  seenKeys.add(importKey);

  return {
    valid: {
      rowNumber,
      topic: topicRaw,
      subtopic,
      title: titleRaw,
      difficulty,
      sourceUrl: urlRaw,
      platform,
      platformId,
      orderInTopic,
      tags,
      importKey,
    },
  };
}

/**
 * Parses CSV, TSV, or JSON string into validated rows and invalid rows with reasons.
 */
export function parseQuestionBankInput(
  content: string,
  format: "csv" | "json" | "text"
): ParseImportResult {
  const validRows: ParsedImportRow[] = [];
  const invalidRows: InvalidImportRow[] = [];
  const topicOrder: string[] = [];
  const seenTopics = new Set<string>();
  const seenKeys = new Set<string>();
  const perTopicAutoOrder = new Map<string, number>();

  if (!content.trim()) {
    return { validRows, invalidRows: [{ rowNumber: 1, rawTitle: "(Empty)", reason: "Input is empty" }], topicOrder };
  }

  if (format === "json") {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(content);
    } catch {
      return {
        validRows,
        invalidRows: [{ rowNumber: 1, rawTitle: "(JSON)", reason: "Malformed JSON syntax" }],
        topicOrder,
      };
    }

    let items: unknown[] | null = null;
    if (Array.isArray(parsedJson)) {
      items = parsedJson;
    } else if (parsedJson && typeof parsedJson === "object") {
      const obj = parsedJson as Record<string, unknown>;
      if (Array.isArray(obj.problems)) items = obj.problems;
      else if (Array.isArray(obj.rows)) items = obj.rows;
    }

    if (!items) {
      return {
        validRows,
        invalidRows: [
          { rowNumber: 1, rawTitle: "(JSON)", reason: "JSON must be an array of problem objects" },
        ],
        topicOrder,
      };
    }

    items.forEach((item, index) => {
      const rowNumber = index + 1;
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        invalidRows.push({
          rowNumber,
          rawTitle: `(Item ${rowNumber})`,
          reason: "Each JSON item must be an object",
        });
        return;
      }

      const normalizedRecord: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
        normalizedRecord[normalizeHeader(k)] = v;
      }

      const res = validateAndBuildRow(normalizedRecord, rowNumber, perTopicAutoOrder, seenKeys);
      if (res.invalid) {
        invalidRows.push(res.invalid);
      } else if (res.valid) {
        validRows.push(res.valid);
        if (!seenTopics.has(res.valid.topic)) {
          seenTopics.add(res.valid.topic);
          topicOrder.push(res.valid.topic);
        }
      }
    });

    return { validRows, invalidRows, topicOrder };
  }

  // CSV or pasted CSV/TSV text
  const matrix = parseDelimitedText(content);
  if (matrix.length < 2) {
    return {
      validRows,
      invalidRows: [
        {
          rowNumber: 1,
          rawTitle: "(Header)",
          reason: "Input must include a header row and at least one data row",
        },
      ],
      topicOrder,
    };
  }

  const headers = matrix[0].map(normalizeHeader);
  if (!headers.includes("topic") || !headers.includes("title")) {
    return {
      validRows,
      invalidRows: [
        {
          rowNumber: 1,
          rawTitle: "(Header)",
          reason: "Header row must contain at least 'topic' and 'title' columns",
        },
      ],
      topicOrder,
    };
  }

  for (let i = 1; i < matrix.length; i++) {
    const cells = matrix[i];
    if (cells.every((c) => c.trim() === "")) continue;
    const rowNumber = i + 1;
    const rawRecord: Record<string, unknown> = {};
    for (let c = 0; c < headers.length; c++) {
      rawRecord[headers[c]] = cells[c] ?? "";
    }

    const res = validateAndBuildRow(rawRecord, rowNumber, perTopicAutoOrder, seenKeys);
    if (res.invalid) {
      invalidRows.push(res.invalid);
    } else if (res.valid) {
      validRows.push(res.valid);
      if (!seenTopics.has(res.valid.topic)) {
        seenTopics.add(res.valid.topic);
        topicOrder.push(res.valid.topic);
      }
    }
  }

  return { validRows, invalidRows, topicOrder };
}
