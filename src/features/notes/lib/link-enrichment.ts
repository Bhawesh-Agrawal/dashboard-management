import dns from "node:dns/promises";
import net from "node:net";
import type { LinkContentType, LinkMeta } from "./capture-types";

export type LookupFn = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

const MAX_BYTES = 1_048_576; // 1 MB
const TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 3;

export function detectContentType(rawUrl: string): LinkContentType {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return "generic";
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const path = parsed.pathname.toLowerCase();

  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    if (path.startsWith("/playlist")) return "youtube_playlist";
    if (path.startsWith("/watch") || path.startsWith("/shorts/") || path.startsWith("/live/")) {
      return "youtube_video";
    }
  }
  if (host === "youtu.be") {
    return "youtube_video";
  }

  if (host === "open.spotify.com") {
    if (path.startsWith("/playlist/")) return "spotify_playlist";
    if (path.startsWith("/album/")) return "spotify_album";
    if (path.startsWith("/track/")) return "spotify_track";
    if (path.startsWith("/episode/") || path.startsWith("/show/")) return "spotify_episode";
  }

  if (path.length > 1 && !path.endsWith("/")) {
    return "article";
  }

  return "generic";
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let num = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    num = (num << 8) + n;
  }
  return num >>> 0;
}

export function isPrivateOrReservedIp(ip: string): boolean {
  const normalized = ip.trim().toLowerCase();
  if (!normalized) return true;

  // Handle IPv4-mapped IPv6 like ::ffff:127.0.0.1 or ::ffff:7f00:1
  if (normalized.startsWith("::ffff:")) {
    const rest = normalized.slice(7);
    if (net.isIPv4(rest)) {
      return isPrivateOrReservedIp(rest);
    }
    const hexParts = rest.split(":");
    if (hexParts.length === 2) {
      const hi = parseInt(hexParts[0], 16);
      const lo = parseInt(hexParts[1], 16);
      if (!Number.isNaN(hi) && !Number.isNaN(lo)) {
        const ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
        return isPrivateOrReservedIp(ipv4);
      }
    }
  }

  if (net.isIPv4(normalized)) {
    const int = ipv4ToInt(normalized);
    if (int === null) return true;
    const b0 = (int >>> 24) & 0xff;
    const b1 = (int >>> 16) & 0xff;
    // 0.0.0.0/8, 10.0.0.0/8, 127.0.0.0/8
    if (b0 === 0 || b0 === 10 || b0 === 127) return true;
    // 100.64.0.0/10 (CGNAT)
    if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;
    // 169.254.0.0/16 (link-local)
    if (b0 === 169 && b1 === 254) return true;
    // 172.16.0.0/12
    if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;
    // 192.168.0.0/16
    if (b0 === 192 && b1 === 168) return true;
    // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
    if (b0 >= 224) return true;
    return false;
  }

  if (net.isIPv6(normalized)) {
    const stripped = normalized.split("%")[0];
    if (stripped === "::" || stripped === "::1") return true;
    // fc00::/7 (Unique Local)
    if (stripped.startsWith("fc") || stripped.startsWith("fd")) return true;
    // fe80::/10 (Link-Local)
    if (/^fe[89ab][0-9a-f]/i.test(stripped)) return true;
    return false;
  }

  return true;
}

function tryParseNumericHost(hostname: string): string | null {
  // Single integer (decimal or hex): e.g. 2130706433 or 0x7f000001
  if (/^(0x[0-9a-f]+|\d+)$/i.test(hostname)) {
    const num = Number(hostname);
    if (Number.isInteger(num) && num >= 0 && num <= 0xffffffff) {
      return `${(num >>> 24) & 0xff}.${(num >>> 16) & 0xff}.${(num >>> 8) & 0xff}.${num & 0xff}`;
    }
  }
  return null;
}

export async function validateExternalUrl(
  rawUrl: string,
  lookupFn: LookupFn = (host) => dns.lookup(host, { all: true })
): Promise<{ ok: true; url: URL } | { ok: false; error: string }> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, error: "Invalid URL" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Only http and https URLs are allowed" };
  }

  if (parsed.port) {
    const allowedDefault =
      (parsed.protocol === "http:" && parsed.port === "80") ||
      (parsed.protocol === "https:" && parsed.port === "443");
    if (!allowedDefault) {
      return { ok: false, error: "Non-standard ports are blocked" };
    }
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    return { ok: false, error: "Blocked host" };
  }

  const numericIp = tryParseNumericHost(hostname);
  if (numericIp && isPrivateOrReservedIp(numericIp)) {
    return { ok: false, error: "Blocked private IP" };
  }

  if (net.isIP(hostname) !== 0) {
    if (isPrivateOrReservedIp(hostname)) {
      return { ok: false, error: "Blocked private IP" };
    }
    return { ok: true, url: parsed };
  }

  try {
    const records = await lookupFn(hostname);
    if (!records || records.length === 0) {
      return { ok: false, error: "Host did not resolve" };
    }
    for (const rec of records) {
      if (isPrivateOrReservedIp(rec.address)) {
        return { ok: false, error: "Blocked resolved private IP" };
      }
    }
  } catch {
    return { ok: false, error: "DNS lookup failed" };
  }

  return { ok: true, url: parsed };
}

export function extractMetaTag(html: string, name: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${name}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${name}["']`, "i"),
    new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, "i"),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

export function extractHtmlTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1]?.replace(/\s+/g, " ").trim() || null;
}

export function parseHtmlMetadata(html: string, pageUrl: URL): {
  title: string | null;
  description: string | null;
  thumbnail: string | null;
  siteName: string | null;
} {
  const head = html.slice(0, 100_000);
  const title =
    extractMetaTag(head, "og:title") ||
    extractMetaTag(head, "twitter:title") ||
    extractHtmlTitle(head);
  const description =
    extractMetaTag(head, "og:description") ||
    extractMetaTag(head, "twitter:description") ||
    extractMetaTag(head, "description");
  const rawImage =
    extractMetaTag(head, "og:image") ||
    extractMetaTag(head, "twitter:image");
  const siteName = extractMetaTag(head, "og:site_name");

  let thumbnail: string | null = null;
  if (rawImage) {
    try {
      const resolved = new URL(rawImage, pageUrl.origin);
      if (resolved.protocol === "http:" || resolved.protocol === "https:") {
        thumbnail = resolved.toString();
      }
    } catch {
      thumbnail = null;
    }
  }

  return { title, description, thumbnail, siteName };
}

async function readBodyWithCap(res: Response): Promise<string> {
  const contentLength = res.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BYTES) {
    throw new Error("Response exceeds 1 MB cap");
  }
  if (!res.body) {
    const text = await res.text();
    if (Buffer.byteLength(text, "utf8") > MAX_BYTES) {
      throw new Error("Response exceeds 1 MB cap");
    }
    return text;
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        throw new Error("Response exceeds 1 MB cap");
      }
      chunks.push(value);
    }
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(combined);
}

async function safeFetchWithRedirects(
  startUrl: string,
  fetchFn: typeof fetch,
  lookupFn: LookupFn
): Promise<{ response: Response; finalUrl: URL }> {
  let currentUrl = startUrl;

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const check = await validateExternalUrl(currentUrl, lookupFn);
    if (!check.ok) {
      throw new Error(check.error);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetchFn(check.url.toString(), {
        method: "GET",
        redirect: "manual",
        credentials: "omit",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; CodexDash/1.0)",
          Accept: "text/html,application/json",
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new Error("Redirect without Location header");
      }
      currentUrl = new URL(location, check.url.toString()).toString();
      continue;
    }

    return { response, finalUrl: check.url };
  }

  throw new Error("Too many redirects");
}

async function tryOEmbed(
  url: URL,
  contentType: LinkContentType,
  fetchFn: typeof fetch,
  lookupFn: LookupFn
): Promise<Partial<LinkMeta> | null> {
  let oembedUrl: string | null = null;
  if (contentType === "youtube_video" || contentType === "youtube_playlist") {
    oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url.toString())}&format=json`;
  } else if (contentType.startsWith("spotify_")) {
    oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url.toString())}`;
  }
  if (!oembedUrl) return null;

  try {
    const { response } = await safeFetchWithRedirects(oembedUrl, fetchFn, lookupFn);
    if (!response.ok) return null;
    const raw = await readBodyWithCap(response);
    const data = JSON.parse(raw) as {
      title?: string;
      author_name?: string;
      provider_name?: string;
      thumbnail_url?: string;
    };
    return {
      title: data.title || undefined,
      siteName: data.provider_name || data.author_name || undefined,
      thumbnail: data.thumbnail_url || undefined,
    };
  } catch {
    return null;
  }
}

export async function fetchLinkMetadata(
  rawUrl: string,
  deps?: { fetchFn?: typeof fetch; lookupFn?: LookupFn }
): Promise<LinkMeta> {
  const fetchFn = deps?.fetchFn ?? fetch;
  const lookupFn = deps?.lookupFn ?? ((host) => dns.lookup(host, { all: true }));
  const contentType = detectContentType(rawUrl);

  let host = "link";
  try {
    host = new URL(rawUrl).hostname.replace(/^www\./, "") || "link";
  } catch {
    return {
      url: rawUrl,
      host,
      contentType,
      fetchedAt: new Date().toISOString(),
      fetchError: "Invalid URL",
    };
  }

  const check = await validateExternalUrl(rawUrl, lookupFn);
  if (!check.ok) {
    return {
      url: rawUrl,
      host,
      contentType,
      fetchedAt: new Date().toISOString(),
      fetchError: check.error,
    };
  }

  try {
    const oembed = await tryOEmbed(check.url, contentType, fetchFn, lookupFn);
    if (oembed?.title) {
      return {
        url: check.url.toString(),
        host,
        siteName: oembed.siteName ?? null,
        title: oembed.title,
        description: null,
        thumbnail: oembed.thumbnail ?? null,
        contentType,
        fetchedAt: new Date().toISOString(),
        fetchError: null,
      };
    }

    const { response, finalUrl } = await safeFetchWithRedirects(
      check.url.toString(),
      fetchFn,
      lookupFn
    );
    if (!response.ok) {
      return {
        url: check.url.toString(),
        host,
        contentType,
        fetchedAt: new Date().toISOString(),
        fetchError: `HTTP ${response.status}`,
      };
    }

    const html = await readBodyWithCap(response);
    const parsed = parseHtmlMetadata(html, finalUrl);

    return {
      url: finalUrl.toString(),
      host: finalUrl.hostname.replace(/^www\./, "") || host,
      siteName: parsed.siteName,
      title: parsed.title || host,
      description: parsed.description,
      thumbnail: parsed.thumbnail,
      contentType: detectContentType(finalUrl.toString()),
      fetchedAt: new Date().toISOString(),
      fetchError: null,
    };
  } catch (error) {
    return {
      url: check.url.toString(),
      host,
      contentType,
      fetchedAt: new Date().toISOString(),
      fetchError: error instanceof Error ? error.message : "Fetch failed",
    };
  }
}
