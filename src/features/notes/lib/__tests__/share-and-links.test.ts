import { describe, expect, it } from "vitest";
import { cleanTrackingParams, extractSharedCapture } from "../share-target";
import {
  detectContentType,
  fetchLinkMetadata,
  parseHtmlMetadata,
  validateExternalUrl,
  type LookupFn,
} from "../link-enrichment";
import { buildLoginRedirectUrl, sanitizeReturnUrl } from "@/features/auth/lib/return-url";

const publicLookup: LookupFn = async () => [{ address: "93.184.216.34", family: 4 }];

describe("Web Share Target & returnUrl", () => {
  it("extracts URL from url, text, title, multiple URLs, or falls back to note", () => {
    expect(
      extractSharedCapture({
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&utm_source=share",
        title: "Great video",
      })
    ).toEqual({
      kind: "link",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: "Great video",
      text: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      empty: false,
    });

    // Android often puts URL inside text
    expect(
      extractSharedCapture({
        title: "Playlist",
        text: "Check out this playlist https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc123",
      })
    ).toEqual({
      kind: "link",
      url: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
      title: "Playlist",
      text: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
      empty: false,
    });

    // URL inside title
    expect(
      extractSharedCapture({
        title: "Read https://example.com/post?utm_campaign=fall&id=42",
      })
    ).toEqual({
      kind: "link",
      url: "https://example.com/post?id=42",
      title: "Read https://example.com/post?utm_campaign=fall&id=42",
      text: "https://example.com/post?id=42",
      empty: false,
    });

    // Multiple URLs -> picks first
    expect(
      extractSharedCapture({
        text: "First https://one.example.com/a and second https://two.example.com/b",
      }).url
    ).toBe("https://one.example.com/a");

    // No URL -> plain note
    expect(extractSharedCapture({ title: "Thought", text: "Remember to revise DP" })).toEqual({
      kind: "note",
      title: "Thought",
      text: "Thought\nRemember to revise DP",
      empty: false,
    });

    // Empty input
    expect(extractSharedCapture({})).toEqual({
      kind: "note",
      text: "",
      empty: true,
    });
  });

  it("cleans tracking params without breaking essential query params", () => {
    expect(
      cleanTrackingParams("https://www.youtube.com/watch?v=abc123&t=45s&si=track&utm_source=ig")
    ).toBe("https://www.youtube.com/watch?v=abc123&t=45s");
  });

  it("preserves /capture/share query params in returnUrl and blocks open redirects", () => {
    const reqUrl = new URL(
      "https://app.example.com/capture/share?title=Hello&url=https%3A%2F%2Fyoutu.be%2Fabc"
    );
    const redirectUrl = buildLoginRedirectUrl(reqUrl);
    expect(redirectUrl.pathname).toBe("/login");
    expect(redirectUrl.searchParams.get("returnUrl")).toBe(
      "/capture/share?title=Hello&url=https%3A%2F%2Fyoutu.be%2Fabc"
    );
    expect(sanitizeReturnUrl(redirectUrl.searchParams.get("returnUrl"))).toBe(
      "/capture/share?title=Hello&url=https%3A%2F%2Fyoutu.be%2Fabc"
    );
    expect(sanitizeReturnUrl("https://evil.com")).toBe("/today");
    expect(sanitizeReturnUrl("//evil.com")).toBe("/today");
  });
});

describe("Content-type detection", () => {
  it.each([
    ["https://www.youtube.com/watch?v=123", "youtube_video"],
    ["https://youtu.be/123", "youtube_video"],
    ["https://www.youtube.com/playlist?list=PL123", "youtube_playlist"],
    ["https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M", "spotify_playlist"],
    ["https://open.spotify.com/album/123", "spotify_album"],
    ["https://open.spotify.com/track/123", "spotify_track"],
    ["https://open.spotify.com/episode/123", "spotify_episode"],
    ["https://blog.example.com/posts/hello-world", "article"],
    ["https://example.com/", "generic"],
  ] as const)("detects %s as %s", (url, expected) => {
    expect(detectContentType(url)).toBe(expected);
  });
});

describe("SSRF blocking and metadata parsing", () => {
  it("blocks private IPv4, IPv6, localhost, decimal/hex IP tricks, and non-standard ports", async () => {
    const blockedUrls = [
      "http://127.0.0.1/admin",
      "http://10.0.0.1/secret",
      "http://172.16.0.5/",
      "http://192.168.1.1/",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/",
      "http://[fc00::1]/",
      "http://[fe80::1]/",
      "http://localhost/api",
      "http://2130706433/",
      "http://0x7f000001/",
      "https://example.com:8443/path",
      "file:///etc/passwd",
    ];

    for (const url of blockedUrls) {
      const res = await validateExternalUrl(url, publicLookup);
      expect(res.ok, `Expected ${url} to be blocked`).toBe(false);
    }

    // DNS resolving to private IP
    const dnsPrivate = await validateExternalUrl("https://rebind.example.com", async () => [
      { address: "127.0.0.1", family: 4 },
    ]);
    expect(dnsPrivate.ok).toBe(false);
  });

  it("blocks redirects to private hosts", async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/internal" },
      });

    const meta = await fetchLinkMetadata("https://example.com/start", {
      fetchFn: fakeFetch,
      lookupFn: publicLookup,
    });
    expect(meta.fetchError).toBeTruthy();
  });

  it("parses HTML Open Graph metadata and YouTube oEmbed via injected fetch", async () => {
    const html = `
      <html><head>
        <title>Fallback Title</title>
        <meta property="og:title" content="OG Title" />
        <meta property="og:description" content="OG Desc" />
        <meta property="og:image" content="/thumb.png" />
        <meta property="og:site_name" content="Example Blog" />
      </head></html>
    `;
    const parsed = parseHtmlMetadata(html, new URL("https://example.com/post"));
    expect(parsed).toEqual({
      title: "OG Title",
      description: "OG Desc",
      thumbnail: "https://example.com/thumb.png",
      siteName: "Example Blog",
    });

    const fakeFetch: typeof fetch = async (input) => {
      const urlStr = typeof input === "string" ? input : input.toString();
      if (urlStr.includes("youtube.com/oembed")) {
        return new Response(
          JSON.stringify({
            title: "MIT 6.006 Lecture 1",
            provider_name: "YouTube",
            thumbnail_url: "https://i.ytimg.com/vi/abc/hqdefault.jpg",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
    };

    const ytMeta = await fetchLinkMetadata("https://www.youtube.com/watch?v=abc", {
      fetchFn: fakeFetch,
      lookupFn: publicLookup,
    });
    expect(ytMeta.title).toBe("MIT 6.006 Lecture 1");
    expect(ytMeta.contentType).toBe("youtube_video");
    expect(ytMeta.thumbnail).toBe("https://i.ytimg.com/vi/abc/hqdefault.jpg");
  });
});
