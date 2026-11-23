import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, UnauthorizedError } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    await getCurrentUserId();
    const { url } = await req.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return NextResponse.json({ error: "Only HTTP(S) URLs are supported" }, { status: 400 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; NoteApp/1.0)",
        Accept: "text/html",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return NextResponse.json(
        { title: parsed.hostname, description: "", image: null, favicon: null },
        { status: 200 }
      );
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      return NextResponse.json(
        { title: parsed.hostname, description: "", image: null, favicon: null },
        { status: 200 }
      );
    }

    const html = await response.text();
    const head = html.slice(0, 50000);

    const ogTitle = extractMeta(head, "og:title") || extractTitle(head);
    const ogDescription = extractMeta(head, "og:description") || extractMeta(head, "description");
    const ogImage = extractMeta(head, "og:image");
    const favicon = extractFavicon(head, parsed.origin);

    return NextResponse.json({
      title: ogTitle || parsed.hostname,
      description: ogDescription || "",
      image: ogImage || null,
      favicon,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Link metadata fetch failed:", error);
    return NextResponse.json(
      { title: "", description: "", image: null, favicon: null },
      { status: 200 }
    );
  }
}

function extractMeta(html: string, name: string): string | null {
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

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1]?.trim() || null;
}

function extractFavicon(html: string, origin: string): string | null {
  const patterns = [
    /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["']/i,
    /<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["']/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const href = match[1];
      if (href.startsWith("http")) return href;
      if (href.startsWith("//")) return `https:${href}`;
      if (href.startsWith("/")) return `${origin}${href}`;
      return `${origin}/${href}`;
    }
  }

  return `${origin}/favicon.ico`;
}
