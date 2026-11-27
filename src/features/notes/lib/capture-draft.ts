import type { NoteKind } from "./capture-types";

export const CAPTURE_DRAFT_STORAGE_KEY = "codexdash_note_capture_draft_v1";

export interface CaptureDraft {
  kind: NoteKind;
  text: string;
  source?: string;
  title?: string;
  savedAt: string;
}

const URL_REGEX = /https?:\/\/[^\s<>"'`)\]]+/i;

export function extractFirstUrl(input: string): string | null {
  const match = input.match(URL_REGEX);
  if (!match) return null;
  try {
    const parsed = new URL(match[0]);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
}

export function looksLikeUrl(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  if (/\s/.test(trimmed)) return false;
  return extractFirstUrl(trimmed) !== null;
}

export function saveCaptureDraft(
  draft: Omit<CaptureDraft, "savedAt">,
  storage: Pick<Storage, "setItem"> | null | undefined = typeof window !== "undefined"
    ? window.localStorage
    : null
): void {
  if (!storage) return;
  try {
    storage.setItem(
      CAPTURE_DRAFT_STORAGE_KEY,
      JSON.stringify({ ...draft, savedAt: new Date().toISOString() })
    );
  } catch {
    // Ignore quota/storage errors
  }
}

export function loadCaptureDraft(
  storage: Pick<Storage, "getItem"> | null | undefined = typeof window !== "undefined"
    ? window.localStorage
    : null
): CaptureDraft | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(CAPTURE_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CaptureDraft>;
    if (!parsed || typeof parsed.text !== "string") return null;
    return {
      kind: parsed.kind ?? "note",
      text: parsed.text,
      source: typeof parsed.source === "string" ? parsed.source : undefined,
      title: typeof parsed.title === "string" ? parsed.title : undefined,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function clearCaptureDraft(
  storage: Pick<Storage, "removeItem"> | null | undefined = typeof window !== "undefined"
    ? window.localStorage
    : null
): void {
  if (!storage) return;
  try {
    storage.removeItem(CAPTURE_DRAFT_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}
