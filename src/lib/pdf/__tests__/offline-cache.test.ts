import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  PINNED_DOCUMENTS_CACHE,
  getOfflineDocCacheKey,
  isDocumentCached,
  saveDocumentOffline,
  removeDocumentOffline,
  getCachedDocumentBlobUrl,
} from "../offline-cache";

describe("offline-cache (pinned documents)", () => {
  let mockCache: {
    match: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockCache = {
      match: vi.fn(),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(true),
    };

    const mockCaches = {
      open: vi.fn().mockResolvedValue(mockCache),
    };

    vi.stubGlobal("caches", mockCaches);
    vi.stubGlobal("window", { caches: mockCaches });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keys the cache strictly by file id, not by presigned URL", () => {
    const fileId = "doc-uuid-1234";
    const cacheKey = getOfflineDocCacheKey(fileId);
    expect(cacheKey).toBe("/offline-doc/doc-uuid-1234");
    expect(cacheKey).not.toContain("X-Amz-Signature");
    expect(cacheKey).not.toContain("token");
  });

  it("checks whether document is cached using the fileId key", async () => {
    mockCache.match.mockResolvedValueOnce({ ok: true });
    const cached = await isDocumentCached("doc-1");
    expect(mockCache.match).toHaveBeenCalledWith("/offline-doc/doc-1");
    expect(cached).toBe(true);

    mockCache.match.mockResolvedValueOnce(null);
    const notCached = await isDocumentCached("doc-2");
    expect(mockCache.match).toHaveBeenCalledWith("/offline-doc/doc-2");
    expect(notCached).toBe(false);
  });

  it("saves document to cache storage using fileId key", async () => {
    const mockBlob = new Blob(["test-pdf-bytes"], { type: "application/pdf" });
    const mockResponse = {
      ok: true,
      status: 200,
      blob: () => Promise.resolve(mockBlob),
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    const result = await saveDocumentOffline("doc-abc", "https://s3.example.com/file?presigned=true");
    expect(result.ok).toBe(true);
    expect(mockCache.put).toHaveBeenCalledWith("/offline-doc/doc-abc", mockResponse);
  });

  it("removes document from cache using fileId key", async () => {
    const removed = await removeDocumentOffline("doc-xyz");
    expect(mockCache.delete).toHaveBeenCalledWith("/offline-doc/doc-xyz");
    expect(removed).toBe(true);
  });

  it("retrieves document as blob URL from cache without network", async () => {
    const mockBlob = new Blob(["cached content"], { type: "application/pdf" });
    mockCache.match.mockResolvedValueOnce({
      blob: () => Promise.resolve(mockBlob),
    });
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn().mockReturnValue("blob:http://localhost/mock-blob-id"),
    });

    const blobUrl = await getCachedDocumentBlobUrl("doc-cached-1");
    expect(mockCache.match).toHaveBeenCalledWith("/offline-doc/doc-cached-1");
    expect(blobUrl).toBe("blob:http://localhost/mock-blob-id");
  });
});
