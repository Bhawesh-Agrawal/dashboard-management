/**
 * Lightweight server-side in-memory cache with TTL.
 *
 * Used for stable reference data (grading configs, semesters, course lists)
 * that changes rarely but is queried on every page load.
 *
 * - Survives across requests in the same Node.js process lifetime
 * - Auto-expires entries after `ttlMs` milliseconds
 * - Safe: never throws; falls back to refetch on any error
 * - NOT shared across serverless function instances — each cold start gets a fresh cache
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class MemCache {
  private store = new Map<string, CacheEntry<unknown>>();

  /**
   * Get a cached value, or compute it if missing/expired.
   *
   * @param key    Unique cache key
   * @param ttlMs  Time-to-live in milliseconds (default: 60s)
   * @param fn     Async function to compute the value on cache miss
   */
  async get<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const entry = this.store.get(key) as CacheEntry<T> | undefined;

    if (entry && entry.expiresAt > now) {
      return entry.value;
    }

    const value = await fn();
    this.store.set(key, { value, expiresAt: now + ttlMs });
    return value;
  }

  /**
   * Invalidate a specific key (e.g. after a mutation).
   */
  invalidate(key: string): void {
    this.store.delete(key);
  }

  /**
   * Invalidate all keys matching a prefix.
   */
  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Invalidate everything.
   */
  invalidateAll(): void {
    this.store.clear();
  }

  /** Number of entries currently in cache (for debugging). */
  get size(): number {
    return this.store.size;
  }
}

// Singleton — survives across requests in the same process
const globalForCache = globalThis as unknown as { __memCache: MemCache | undefined };
export const memCache = globalForCache.__memCache ?? new MemCache();
if (process.env.NODE_ENV !== "production") globalForCache.__memCache = memCache;

// TTL constants
export const TTL = {
  /** Stable config data — grading tiers, attendance config: 10 minutes */
  CONFIG: 10 * 60 * 1000,
  /** Semester / course lists (rarely change mid-session): 5 minutes */
  SEMESTER: 5 * 60 * 1000,
  /** Dashboard aggregate data: 60 seconds */
  DASHBOARD: 60 * 1000,
  /** User auth / Google Calendar connection status: 5 minutes */
  AUTH: 5 * 60 * 1000,
};
