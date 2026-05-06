import { safeRedisCall } from '@/lib/server/redis';

// ─── L1 In-Memory Cache ───────────────────────────────────────────────────────
interface L1Entry<T> {
  data: T;
  expiresAt: number;
}

const l1Store = new Map<string, L1Entry<any>>();
const L1_TTL_MS = 30_000; // 30 seconds

function l1Get<T>(key: string): T | null {
  const entry = l1Store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    l1Store.delete(key);
    return null;
  }
  return entry.data as T;
}

function l1Set<T>(key: string, data: T, ttlMs = L1_TTL_MS) {
  l1Store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

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
    const l1 = l1Get<T>(key);
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

      l1Set(key, parsed);
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

    l1Set(key, data, memTtl);
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
    l1Store.delete(key);
    await safeRedisCall((redis) => redis.del(key), null, `cache:del:${key}`);
  }

  /**
   * Evict all keys matching a prefix pattern from L1 and Redis.
   */
  static async invalidatePrefix(prefix: string) {
    for (const key of l1Store.keys()) {
      if (key.startsWith(prefix)) l1Store.delete(key);
    }

    await safeRedisCall(async (redis) => {
      const redisKeys = await redis.keys(`${prefix}*`);
      if (redisKeys.length > 0) {
        await redis.del(...redisKeys);
      }
      return null;
    }, null, `cache:del-prefix:${prefix}`);
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
    l1Set(key, data);
    await safeRedisCall(
      (redis) => redis.set(key, JSON.stringify(data), { ex: redisTtlSeconds }),
      null,
      `cache:set:${key}`,
    );
  }
}
