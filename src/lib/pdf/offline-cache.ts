/**
 * Offline storage utility for documents and PDFs using the Cache Storage API.
 * Uses cache name 'pinned-documents-v1' shared with Service Worker.
 */
export const PINNED_DOCUMENTS_CACHE = "pinned-documents-v1";

export async function isDocumentCached(noteId: string): Promise<boolean> {
  if (typeof window === "undefined" || !("caches" in window)) return false;
  try {
    const cache = await caches.open(PINNED_DOCUMENTS_CACHE);
    const match = await cache.match(`/offline-doc/${noteId}`);
    return !!match;
  } catch {
    return false;
  }
}

export async function saveDocumentOffline(
  noteId: string,
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
    await cache.put(`/offline-doc/${noteId}`, res);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to cache document",
    };
  }
}

export async function removeDocumentOffline(noteId: string): Promise<boolean> {
  if (typeof window === "undefined" || !("caches" in window)) return false;
  try {
    const cache = await caches.open(PINNED_DOCUMENTS_CACHE);
    return await cache.delete(`/offline-doc/${noteId}`);
  } catch {
    return false;
  }
}

export async function getCachedDocumentBlobUrl(
  noteId: string
): Promise<string | null> {
  if (typeof window === "undefined" || !("caches" in window)) return null;
  try {
    const cache = await caches.open(PINNED_DOCUMENTS_CACHE);
    const res = await cache.match(`/offline-doc/${noteId}`);
    if (!res) return null;
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}
