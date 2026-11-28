import { z } from "zod";

export interface AssistantSource {
  type: "course" | "task" | "event" | "note" | "project" | "semester" | "brief" | "dsa";
  id: string;
  title: string;
  href: string;
}

export type ProposalKind = "create_task" | "update_task" | "create_event" | "save_note";
export type ProposalStatus = "pending" | "confirmed" | "dismissed" | "expired";

export interface AssistantProposal {
  id: string;
  kind: ProposalKind;
  summary: string;
  payload: Record<string, unknown>;
  status: ProposalStatus;
  expiresAt: string;
  resultRef?: { id: string; href: string; label: string } | null;
}

export interface ToolExecutionResult {
  data: unknown;
  sources?: AssistantSource[];
  proposals?: AssistantProposal[];
  truncated?: boolean;
}

export interface AssistantTool<TInput = Record<string, unknown>> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  parameters: Record<string, unknown>;
  execute: (userId: string, input: TInput) => Promise<ToolExecutionResult>;
}

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of",
  "with", "by", "from", "as", "is", "was", "are", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could", "should",
  "what", "when", "where", "who", "which", "why", "how", "i", "me", "my", "we",
  "you", "your", "it", "this", "that", "these", "those", "about", "save", "saved",
  "note", "notes", "find", "show", "tell", "give", "get", "list",
]);

export function tokenizeSearchQuery(query: string): string[] {
  const tokens = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}._-]+/gu, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  return Array.from(new Set(tokens)).slice(0, 8);
}

export function capToolResult<T>(
  data: T,
  maxBytes: number = 2048
): { payload: unknown; truncated: boolean } {
  const serialized = JSON.stringify(data);
  if (Buffer.byteLength(serialized, "utf8") <= maxBytes) {
    return { payload: data, truncated: false };
  }

  if (Array.isArray(data)) {
    const trimmed = [...data];
    while (trimmed.length > 1) {
      trimmed.pop();
      const candidate = { items: trimmed, truncated: true, totalCount: data.length };
      if (Buffer.byteLength(JSON.stringify(candidate), "utf8") <= maxBytes) {
        return { payload: candidate, truncated: true };
      }
    }
    return {
      payload: {
        items: trimmed.slice(0, 1),
        truncated: true,
        truncationNote: "Output trimmed to ~2KB.",
      },
      truncated: true,
    };
  }

  if (data && typeof data === "object") {
    const copy: Record<string, unknown> = { ...(data as Record<string, unknown>) };
    // Trim largest array property first
    for (const key of Object.keys(copy)) {
      const val = copy[key];
      if (Array.isArray(val) && val.length > 3) {
        let arr = [...val];
        while (arr.length > 1) {
          arr = arr.slice(0, Math.max(1, Math.floor(arr.length * 0.7)));
          copy[key] = arr;
          copy.truncated = true;
          copy.truncationNote = "Output trimmed to ~2KB; narrow your filter for full results.";
          if (Buffer.byteLength(JSON.stringify(copy), "utf8") <= maxBytes) {
            return { payload: copy, truncated: true };
          }
        }
      }
    }
    // Fallback: truncate string representation
    return {
      payload: {
        summary: serialized.slice(0, Math.max(200, maxBytes - 120)),
        truncated: true,
        truncationNote: "Output trimmed to ~2KB.",
      },
      truncated: true,
    };
  }

  return {
    payload: {
      value: String(data).slice(0, maxBytes - 80),
      truncated: true,
    },
    truncated: true,
  };
}
