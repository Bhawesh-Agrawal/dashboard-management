/**
 * Offline storage utility for documents and PDFs using the Cache Storage API.
 * Uses cache name 'pinned-documents-v1' shared with Service Worker.
 * Cache is strictly keyed by fileId (/offline-doc/${fileId}), NOT by presigned URL.
 */
export const PINNED_DOCUMENTS_CACHE = "pinned-documents-v1";

export function getOfflineDocCacheKey(fileId: string): string {
  return `/offline-doc/${fileId}`;
}

export async function isDocumentCached(fileId: string): Promise<boolean> {
  if (typeof window === "undefined" || !("caches" in window)) return false;
  try {
    const cache = await caches.open(PINNED_DOCUMENTS_CACHE);
    const match = await cache.match(getOfflineDocCacheKey(fileId));
    return !!match;
  } catch {
    return false;
  }
}

export async function saveDocumentOffline(
  fileId: string,
  url: string
): Promise<{ ok: boolean; error?: string }> {
  if (typeof window === "undefined" || !("caches" in window)) {
    return { ok: false, error: "Offline storage is not supported in this browser." };
  }

  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { ok: false, error: `Failed to download file (status ${res.status})` };
    }

    const cache = await caches.open(PINNED_DOCUMENTS_CACHE);
    await cache.put(getOfflineDocCacheKey(fileId), res);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to cache document",
    };
  }
}

export async function removeDocumentOffline(fileId: string): Promise<boolean> {
  if (typeof window === "undefined" || !("caches" in window)) return false;
  try {
    const cache = await caches.open(PINNED_DOCUMENTS_CACHE);
    return await cache.delete(getOfflineDocCacheKey(fileId));
  } catch {
    return false;
  }
}

export async function getCachedDocumentBlobUrl(
  fileId: string
): Promise<string | null> {
  if (typeof window === "undefined" || !("caches" in window)) return null;
  try {
    const cache = await caches.open(PINNED_DOCUMENTS_CACHE);
    const res = await cache.match(getOfflineDocCacheKey(fileId));
    if (!res) return null;
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}
