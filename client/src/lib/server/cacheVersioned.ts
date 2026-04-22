import { getRedis, safeRedisCall } from './redis';

export const CACHE_VERSION_KEY = 'places:version';
export const CACHE_TTL_SECONDS = 90;
export const SCAN_CACHE_TTL_SECONDS = 120;

const normalizeFilter = (value: string): string => {
  const trimmed = String(value || '').trim().toLowerCase();
  return trimmed || 'all';
};

/**
 * Get the current version for cache invalidation.
 * Defaults to 1 if not set in Redis.
 */
export const getCacheVersion = async (): Promise<number> => {
  return safeRedisCall(
    async (client) => {
      const version = await client.get<number>(CACHE_VERSION_KEY);
      return version ?? 1;
    },
    1,
    'getCacheVersion',
  );
};

/**
 * Increment the cache version to invalidate all cached data.
 * Called when admin creates/updates/deletes a place.
 */
export const invalidateCacheVersion = async (): Promise<number> => {
  return safeRedisCall(
    async (client) => {
      const newVersion = await client.incr(CACHE_VERSION_KEY);
      console.info(`[Cache] Version incremented to: ${newVersion}`);
      return newVersion;
    },
    1,
    'invalidateCacheVersion',
  );
};

/**
 * Build a versioned cache key for filtered results.
 * Format: places:v{version}:{name}:{location}:{status}:page:{page}
 */
export const buildCacheKey = async (filters: {
  search?: string;
  location?: string;
  status?: string;
  page?: number;
}): Promise<string> => {
  const version = await getCacheVersion();
  const search = normalizeFilter(filters.search || '');
  const location = normalizeFilter(filters.location || '');
  const status = normalizeFilter(filters.status || 'all');
  const page = filters.page || 1;

  return `places:v${version}:${search}:${location}:${status}:page:${page}`;
};

/**
 * Build a versioned scan cache key for accumulated scan results.
 * Format: places:v{version}:{name}:{location}:{status}:scan
 */
export const buildScanCacheKey = async (filters: {
  search?: string;
  location?: string;
  status?: string;
}): Promise<string> => {
  const version = await getCacheVersion();
  const search = normalizeFilter(filters.search || '');
  const location = normalizeFilter(filters.location || '');
  const status = normalizeFilter(filters.status || 'all');

  return `places:v${version}:${search}:${location}:${status}:scan`;
};

/**
 * Get cached data from Redis.
 */
export const getFromCache = async <T>(key: string): Promise<T | null> => {
  return safeRedisCall(
    async (client) => {
      const data = await client.get<T>(key);
      if (data) {
        console.info(`[Cache] HIT: ${key}`);
      }
      return data ?? null;
    },
    null,
    `getFromCache:${key}`,
  );
};

/**
 * Store data in Redis with TTL.
 */
export const setInCache = async <T>(
  key: string,
  data: T,
  ttlSeconds: number = CACHE_TTL_SECONDS,
): Promise<boolean> => {
  return safeRedisCall(
    async (client) => {
      await client.setex(key, ttlSeconds, JSON.stringify(data));
      console.info(`[Cache] SET: ${key} (TTL: ${ttlSeconds}s)`);
      return true;
    },
    false,
    `setInCache:${key}`,
  );
};

/**
 * Delete a specific cache key.
 */
export const deleteFromCache = async (key: string): Promise<boolean> => {
  return safeRedisCall(
    async (client) => {
      const deleted = await client.del(key);
      if (deleted > 0) {
        console.info(`[Cache] DELETED: ${key}`);
      }
      return deleted > 0;
    },
    false,
    `deleteFromCache:${key}`,
  );
};

/**
 * Cache data as JSON, handling stringify/parse.
 */
export const getCacheJson = async <T extends Record<string, any>>(key: string): Promise<T | null> => {
  const raw = await getFromCache<string>(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    console.warn(`[Cache] Failed to parse JSON for key: ${key}`);
    return null;
  }
};

/**
 * Set cache data from JSON.
 */
export const setCacheJson = async <T extends Record<string, any>>(
  key: string,
  data: T,
  ttlSeconds: number = CACHE_TTL_SECONDS,
): Promise<boolean> => {
  try {
    return await setInCache(key, JSON.stringify(data), ttlSeconds);
  } catch (error) {
    console.error(`[Cache] Failed to stringify for key ${key}:`, error);
    return false;
  }
};
