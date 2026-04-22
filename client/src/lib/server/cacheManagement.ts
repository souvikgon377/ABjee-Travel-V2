import { getRedis } from './redis';

// ============================================================================
// Configuration
// ============================================================================

const VERSION_KEY = 'places:version';
const MAX_CACHED_SCAN_SIZE = 200; // Prevent memory explosion
const PAGE_CACHE_TTL = 90; // seconds
const SCAN_CACHE_TTL = 120; // seconds
const SCAN_LOCK_TTL = 5; // seconds

// ============================================================================
// Utilities
// ============================================================================

/**
 * Normalize input to prevent cache fragmentation from typos/casing.
 * CRITICAL for cache hit rate.
 */
export function normalizeInput(value?: string): string {
  const normalized = value?.toLowerCase().trim() || 'all';
  return normalized;
}

/**
 * Log raw vs normalized for debugging cache misses.
 */
function logNormalization(raw: { name?: string; location?: string; status?: string }, normalized: { name: string; location: string; status: string }) {
  if (process.env.NODE_ENV === 'development') {
    console.debug('[Cache] RAW input:', raw);
    console.debug('[Cache] NORMALIZED:', normalized);
  }
}

/**
 * Detect possible typos (when raw differs significantly from normalized).
 */
function detectPossibleTypo(rawValue?: string, normalizedValue?: string): boolean {
  if (!rawValue) return false;
  const raw = rawValue.toLowerCase().trim();
  const norm = normalizedValue?.toLowerCase().trim() || 'all';
  // If raw !== norm, there was some normalization (casing, whitespace, etc.)
  // This is expected and fine.
  return false;
}

// ============================================================================
// Cache Key Building
// ============================================================================

/**
 * Build a page cache key using the current version.
 * Format: places:v{version}:{name}:{location}:{status}:page:{page}
 */
export async function buildPageCacheKey(params: {
  name?: string;
  location?: string;
  status?: string;
  page?: number;
}): Promise<string> {
  const version = await getCacheVersion();
  const name = normalizeInput(params.name);
  const location = normalizeInput(params.location);
  const status = normalizeInput(params.status);
  const page = params.page || 1;

  return `places:v${version}:${name}:${location}:${status}:page:${page}`;
}

/**
 * Build a scan cache key (not tied to specific page).
 * Format: places:v{version}:{name}:{location}:{status}:scan
 */
export async function buildScanCacheKey(params: {
  name?: string;
  location?: string;
  status?: string;
}): Promise<string> {
  const version = await getCacheVersion();
  const name = normalizeInput(params.name);
  const location = normalizeInput(params.location);
  const status = normalizeInput(params.status);

  return `places:v${version}:${name}:${location}:${status}:scan`;
}

/**
 * Build a scan lock key to prevent cache stampede.
 */
async function buildScanLockKey(scanKey: string): Promise<string> {
  return `lock:${scanKey}`;
}

// ============================================================================
// Version Management
// ============================================================================

/**
 * Get the current cache version (defaults to 1).
 */
export async function getCacheVersion(): Promise<number> {
  const redis = getRedis();
  if (!redis) return 1;

  try {
    const version = await redis.get<number>(VERSION_KEY);
    return version ?? 1;
  } catch (error) {
    console.error(`[Cache] Failed to get version:`, error);
    return 1;
  }
}

/**
 * Increment cache version to invalidate all old cache keys.
 * Called after admin create/update/delete.
 */
export async function invalidateCacheVersion(): Promise<number> {
  const redis = getRedis();
  if (!redis) {
    console.warn('[Cache] Invalidation skipped: Redis not available');
    return 1;
  }

  try {
    const newVersion = await redis.incr(VERSION_KEY);
    console.info(`[Cache] Version incremented to ${newVersion} - invalidating all old cache keys`);
    return newVersion;
  } catch (error) {
    console.error(`[Cache] Failed to increment version:`, error);
    return 1;
  }
}

// ============================================================================
// Scan Lock (Prevent Cache Stampede)
// ============================================================================

/**
 * Try to acquire a scan lock. Returns true if lock acquired.
 * Prevents multiple simultaneous scans for the same filter combination.
 */
async function tryAcquireScanLock(lockKey: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true; // No redis = proceed without lock

  try {
    // Try to set the lock with NX (only if not exists) and EX (expiry)
    const result = await redis.set(lockKey, '1', { nx: true, ex: SCAN_LOCK_TTL });
    return result === 'OK';
  } catch (error) {
    console.warn(`[Cache] Failed to acquire scan lock:`, error);
    return true; // Fail open - allow scan to proceed
  }
}

/**
 * Check if a scan lock is currently held.
 */
async function isScanLocked(lockKey: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;

  try {
    const locked = await redis.get<string>(lockKey);
    return locked === '1';
  } catch (error) {
    console.warn(`[Cache] Failed to check scan lock:`, error);
    return false;
  }
}

// ============================================================================
// Cache Operations
// ============================================================================

/**
 * Get a value from cache (typed as generic).
 */
export async function getFromCache<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const data = await redis.get<string | T>(key);
    if (data) {
      console.info(`[Cache] HIT: ${key}`);
      if (typeof data === 'string') {
        try {
          return JSON.parse(data) as T;
        } catch (parseError) {
          console.warn(`[Cache] Failed to parse cached JSON for ${key}, returning raw value.`, parseError);
          return data as unknown as T;
        }
      }
    }
    return data ?? null;
  } catch (error) {
    console.warn(`[Cache] Failed to read from cache (${key}):`, error);
    return null;
  }
}

/**
 * Set a value in cache with TTL.
 */
export async function setInCache<T>(key: string, data: T, ttlSeconds: number = PAGE_CACHE_TTL): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;

  try {
    await redis.set(key, JSON.stringify(data), { ex: ttlSeconds });
    console.info(`[Cache] SET: ${key} (TTL: ${ttlSeconds}s)`);
    return true;
  } catch (error) {
    console.warn(`[Cache] Failed to write to cache (${key}):`, error);
    return false;
  }
}

/**
 * Delete a specific cache key.
 */
export async function deleteFromCache(key: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;

  try {
    const result = await redis.del(key);
    if (result > 0) {
      console.info(`[Cache] DELETED: ${key}`);
    }
    return result > 0;
  } catch (error) {
    console.warn(`[Cache] Failed to delete from cache (${key}):`, error);
    return false;
  }
}

// ============================================================================
// Scan Cache Management
// ============================================================================

/**
 * Get cached scan results. Returns null if not found or expired.
 */
export async function getCachedScanResults<T extends { id: string }>(scanKey: string): Promise<T[] | null> {
  const cached = await getFromCache<T[]>(scanKey);
  if (!cached) {
    console.info(`[Cache] SCAN CACHE MISS: ${scanKey}`);
    return null;
  }

  console.info(`[Cache] SCAN CACHE HIT: ${scanKey} (${cached.length} items)`);
  return cached;
}

/**
 * Cache scan results with size limit to prevent memory explosion.
 */
export async function cacheScanResults<T extends { id: string }>(
  scanKey: string,
  results: T[],
  ttlSeconds: number = SCAN_CACHE_TTL,
): Promise<boolean> {
  // Limit cached size
  const trimmed = results.slice(0, MAX_CACHED_SCAN_SIZE);
  if (trimmed.length < results.length) {
    console.warn(
      `[Cache] Trimmed scan results from ${results.length} to ${MAX_CACHED_SCAN_SIZE} items for cache storage`,
    );
  }

  const success = await setInCache(scanKey, JSON.stringify(trimmed), ttlSeconds);
  if (success) {
    console.info(`[Cache] SCAN CACHED: ${scanKey} (${trimmed.length} items, TTL: ${ttlSeconds}s)`);
  }
  return success;
}

// ============================================================================
// Scan Execution with Lock
// ============================================================================

/**
 * Execute a scan operation with lock to prevent stampede.
 * If lock is held, returns null (caller should wait/retry or fallback).
 */
export async function executeScanWithLock<T extends { id: string }>(
  scanKey: string,
  scanFn: () => Promise<T[]>,
): Promise<T[] | null> {
  const lockKey = await buildScanLockKey(scanKey);

  // Check if already locked
  const isLocked = await isScanLocked(lockKey);
  if (isLocked) {
    console.warn(`[Cache] Scan in progress for ${scanKey}, returning null`);
    return null;
  }

  // Try to acquire lock
  const acquired = await tryAcquireScanLock(lockKey);
  if (!acquired) {
    console.warn(`[Cache] Failed to acquire lock for ${scanKey}`);
    return null;
  }

  try {
    console.info(`[Cache] SCAN EXECUTED: ${scanKey}`);
    const results = await scanFn();
    return results;
  } finally {
    // Lock will auto-expire after SCAN_LOCK_TTL
  }
}

// ============================================================================
// Input Validation Helper
// ============================================================================

/**
 * Validate and normalize filter inputs, logging discrepancies.
 */
export function validateAndNormalizeFilters(params: {
  name?: string;
  location?: string;
  status?: string;
}): { name: string; location: string; status: string } {
  const normalized = {
    name: normalizeInput(params.name),
    location: normalizeInput(params.location),
    status: normalizeInput(params.status),
  };

  logNormalization(params, normalized);

  // Warn about potential typos
  if (params.name && detectPossibleTypo(params.name, normalized.name)) {
    console.warn(
      `[Cache] Possible casing issue in "name" filter:`,
      { raw: params.name, normalized: normalized.name },
    );
  }
  if (params.location && detectPossibleTypo(params.location, normalized.location)) {
    console.warn(
      `[Cache] Possible casing issue in "location" filter:`,
      { raw: params.location, normalized: normalized.location },
    );
  }

  return normalized;
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

export const CACHE_CONFIG = {
  VERSION_KEY,
  MAX_CACHED_SCAN_SIZE,
  PAGE_CACHE_TTL,
  SCAN_CACHE_TTL,
  SCAN_LOCK_TTL,
};
