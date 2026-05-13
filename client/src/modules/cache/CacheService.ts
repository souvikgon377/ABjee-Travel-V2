import { safeRedisCall } from '@/lib/server/redis';
import { GlobalCache } from './GlobalCache';
const L1_TTL_MS = 30_000; // 30 seconds

// ─── Public API ────────────────────────────────────────────────────────────────

export class CacheService {
  /**
   * Tiered L1 (In-Memory 30s) + L2 (Redis 60s) cache.
   * Falls through to `fetcher()` on miss. Caches empty results for 10s.
   */
  static async get<T>(
    key: string,
    fetcher: () => Promise<T>,
    redisTtlSeconds = 60,
  ): Promise<T> {
    // 1. L1 hit
    const l1 = GlobalCache.get<T>(key);
    if (l1 !== null) {
      console.log({ source: 'cache', cacheHit: true, tier: 'l1', key });
      return l1;
    }

    // 2. L2 hit (Redis)
    const l2 = await safeRedisCall<T | null>(
      (redis) => redis.get(key) as Promise<T | null>,
      null,
      `cache:get:${key}`,
    );
    if (l2 !== null && l2 !== undefined) {
      console.log({ source: 'cache', cacheHit: true, tier: 'l2', key });
      // Redis stores JSON-serialized values. Parse if necessary.
      let parsed: any = l2;
      if (typeof l2 === 'string') {
        try {
          parsed = JSON.parse(l2 as unknown as string);
        } catch (err) {
          // If parsing fails, fall back to raw value
          parsed = l2;
        }
      }

      GlobalCache.set(key, parsed, L1_TTL_MS);
      return parsed as T;
    }

    // 3. Cache MISS — fetch fresh data
    console.log({ source: 'cache', cacheHit: false, tier: 'miss', key });
    const data = await fetcher();

    // Negative cache: determine emptiness robustly and store "no results" for 10s to prevent spamming DB
    let isEmpty = false;
    if (data === null || data === undefined) {
      isEmpty = true;
    } else if (Array.isArray(data)) {
      isEmpty = data.length === 0;
    } else if ((data as any).results && Array.isArray((data as any).results)) {
      isEmpty = (data as any).results.length === 0;
    } else if (typeof (data as any).totalCount === 'number') {
      isEmpty = (data as any).totalCount === 0;
    } else if (typeof (data as any).total === 'number') {
      isEmpty = (data as any).total === 0;
    }

    const ttl = isEmpty ? 10 : redisTtlSeconds;
    const memTtl = isEmpty ? 10_000 : L1_TTL_MS;

    GlobalCache.set(key, data, memTtl);
    void safeRedisCall(
      (redis) => redis.set(key, JSON.stringify(data), { ex: ttl }),
      null,
      `cache:set:${key}`,
    );

    return data;
  }

  /**
   * Evict a key from both L1 and L2.
   */
  static async invalidate(key: string) {
    GlobalCache.delete(key);
    await safeRedisCall((redis) => redis.del(key), null, `cache:del:${key}`);
  }

  /**
   * Evict all keys matching a prefix pattern from L1 and Redis.
   */
  static async invalidatePrefix(prefix: string) {
    GlobalCache.invalidatePattern(prefix);

    await safeRedisCall(async (redis) => {
      const redisKeys = await redis.keys(`${prefix}*`);
      if (redisKeys.length > 0) {
        await redis.del(...redisKeys);
      }
      return null;
    }, null, `cache:del-prefix:${prefix}`);
  }

  /**
   * Update a cache entry intelligently:
   * - If the key exists and contains an array, update/replace the item
   * - Otherwise, invalidate and refetch
   */
  static async smartUpdate<T>(
    key: string,
    updater: (current: T | null) => Promise<T>,
    redisTtlSeconds = 60
  ): Promise<T> {
    const current = await this.get<T>(key, async () => null as any, redisTtlSeconds);

    try {
      const updated = await updater(current);
      // Re-cache the updated value
      await this.invalidate(key);
      return updated;
    } catch (error) {
      console.error('[CacheService] Smart update failed, using current value:', { key, error });
      if (current) return current;
      throw error;
    }
  }

  /**
   * Check if a key exists in cache (L1 or L2)
   */
  static async exists(key: string): Promise<boolean> {
    // L1 check
    if (GlobalCache.get(key) !== null) return true;

    // L2 check (Redis)
    const l2Exists = await safeRedisCall<boolean>(
      async (redis) => {
        const result = await redis.exists(key);
        return result === 1;
      },
      false,
      `cache:exists:${key}`
    );

    return l2Exists;
  }

  /**
   * Get all cache keys matching a pattern
   */
  static async getKeys(pattern: string): Promise<string[]> {
    const l1Keys = GlobalCache.keys().filter((k) => k.includes(pattern));

    const l2Keys = await safeRedisCall<string[]>(
      async (redis) => {
        const redisKeys = await redis.keys(`*${pattern}*`);
        return redisKeys || [];
      },
      [],
      `cache:keys:${pattern}`
    );

    // Combine and deduplicate
    const allKeys = new Set([...l1Keys, ...l2Keys]);
    return Array.from(allKeys);
  }

  /**
   * Alias for invalidatePrefix for consistency.
   */
  static async invalidatePattern(pattern: string) {
    await this.invalidatePrefix(pattern);
  }

  /**
   * Explicitly set a value in the cache.
   */
  static async set<T>(key: string, data: T, redisTtlSeconds = 60) {
    GlobalCache.set(key, data, L1_TTL_MS);
    await safeRedisCall(
      (redis) => redis.set(key, JSON.stringify(data), { ex: redisTtlSeconds }),
      null,
      `cache:set:${key}`,
    );
  }
}
