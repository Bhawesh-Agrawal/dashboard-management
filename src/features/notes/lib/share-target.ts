import { extractFirstUrl } from "./capture-draft";
import type { NoteKind } from "./capture-types";

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "igsh",
]);

const SI_STRIP_HOSTS = new Set([
  "youtu.be",
  "youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "open.spotify.com",
]);

export function cleanTrackingParams(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return rawUrl;
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const toDelete: string[] = [];

  for (const key of parsed.searchParams.keys()) {
    const lower = key.toLowerCase();
    if (TRACKING_PARAMS.has(lower)) {
      toDelete.push(key);
    } else if (lower === "si" && SI_STRIP_HOSTS.has(host)) {
      toDelete.push(key);
    }
  }

  for (const key of toDelete) {
    parsed.searchParams.delete(key);
  }

  return parsed.toString();
}

export interface SharedCapturePayload {
  kind: NoteKind;
  url?: string;
  title?: string;
  text: string;
  empty: boolean;
}

export function extractSharedCapture(params: {
  title?: string | null;
  text?: string | null;
  url?: string | null;
}): SharedCapturePayload {
  const title = params.title?.trim() || "";
  const text = params.text?.trim() || "";
  const url = params.url?.trim() || "";

  // Android often puts the shared URL inside `text` or `title`
  const foundUrl =
    extractFirstUrl(url) ||
    extractFirstUrl(text) ||
    extractFirstUrl(title);

  if (foundUrl) {
    const cleaned = cleanTrackingParams(foundUrl);
    return {
      kind: "link",
      url: cleaned,
      ...(title && title !== foundUrl ? { title } : {}),
      text: cleaned,
      empty: false,
    };
  }

  const combined = [title, text].filter(Boolean).join("\n").trim();
  if (!combined) {
    return { kind: "note", text: "", empty: true };
  }

  return {
    kind: "note",
    ...(title ? { title } : {}),
    text: combined,
    empty: false,
  };
}
