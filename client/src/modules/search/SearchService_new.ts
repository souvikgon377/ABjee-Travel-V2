import client, { COLLECTION_NAME, healthCheckTypesense } from './typesenseClient';
import { CacheService } from '../cache/CacheService';
import { TypesenseBreaker } from './typesenseBreaker';
import { MetricsService } from '../analytics/MetricsService';
import { getRedis } from '@/lib/server/redis';
import { GlobalCache } from '@/modules/cache/GlobalCache';
import { FallbackHandler } from './FallbackHandler';

/**
 * SearchOptions - Flexible search configuration
 */
export interface SearchOptions {
  query?: string;
  page?: number;
  limit?: number;
  filter?: string;
  location?: string;
  category?: string;
  isActive?: boolean;
}

/**
 * SearchResult - Consistent search response format
 */
export interface SearchResult {
  results: any[];
  totalCount: number;
  hasMore: boolean;
  source: 'typesense' | 'firestore' | 'snapshot' | 'error';
  latencyMs: number;
  fromCache?: boolean;
}

/**
 * SearchService - Production-grade search orchestrator
 *
 * Strategy (Priority-based):
 * 1. Check L1/L2 cache (30s in-memory, 60s Redis)
 * 2. If Typesense available → try Typesense search
 * 3. If Typesense fails/unavailable → fallback to optimized Firestore
 * 4. If fallback fails → use snapshot cache
 * 5. Always keep Firestore as source of truth
 *
 * Features:
 * - Circuit breaker for Typesense (prevents slamming failing service)
 * - Multi-tier caching (in-memory + Redis)
 * - Graceful fallback to Firestore with optimized queries
 * - Comprehensive logging and metrics
 * - Handles missing composite indexes gracefully
 *
 * Cache Keys Format: search:${query}:p${page}:l${limit}:${filters}
 */
export class SearchService {
  private static readonly CACHE_TTL_MS = 30_000; // 30 seconds
  private static readonly REDIS_TTL_SECONDS = 60; // 60 seconds

  /**
   * Runtime check: is Typesense available?
   */
  private static async isTypesenseAvailable(): Promise<boolean> {
    try {
      return await healthCheckTypesense(2000); // 2s timeout
    } catch (error) {
      console.error('[SearchService] Typesense availability check failed:', error);
      return false;
    }
  }

  /**
   * Runtime check: is Redis available?
   */
  private static isRedisAvailable(): boolean {
    try {
      const redis = getRedis();
      return redis !== null;
    } catch {
      return false;
    }
  }

  /**
   * Build normalized cache key from search options
   * Format: search:${query}:p${page}:l${limit}:${filters}
   */
  private static buildCacheKey(options: SearchOptions): string {
    const q = encodeURIComponent(String(options.query || '').trim().toLowerCase());
    const p = options.page || 1;
    const l = options.limit || 10;
    const cat = options.category ? `c=${encodeURIComponent(String(options.category))}` : 'c=all';
    const loc = options.location
      ? `loc=${encodeURIComponent(String(options.location || '').trim().toLowerCase())}`
      : '';
    const a = typeof options.isActive === 'boolean' ? `a=${options.isActive ? '1' : '0'}` : '';

    return `search:${q}:p${p}:l${l}:${cat}${loc ? ':' + loc : ''}${a ? ':' + a : ''}`;
  }

  /**
   * Try Typesense search (PRIMARY source)
   * Returns null on failure to trigger fallback
   */
  private static async tryTypesenseSearch(options: SearchOptions): Promise<SearchResult | null> {
    const tStart = Date.now();

    try {
      const query = String(options.query || '').trim();
      const page = Math.max(1, options.page || 1);
      const limit = Math.max(1, Math.min(100, options.limit || 10));

      // Build Typesense filter
      const filters: string[] = [];
      if (options.isActive !== undefined) {
        filters.push(`isActive:=${options.isActive ? 'true' : 'false'}`);
      }
      if (options.category && options.category !== 'all') {
        filters.push(`category:=${options.category}`);
      }

      // Build search query
      const effectiveQuery = [query, options.location].filter(Boolean).join(' ').trim();
      const searchParams: any = {
        q: effectiveQuery === '' ? '*' : effectiveQuery,
        query_by: 'name,name_lower,city,area,state,country,location_search,location_lower,description,description_lower',
        sort_by: 'popularity:desc,updatedAt:desc',
        per_page: limit,
        page: page,
      };

      if (filters.length > 0) {
        searchParams.filter_by = filters.join(' && ');
      }

      console.log('[SearchService] Searching Typesense', {
        query: effectiveQuery || '(all)',
        filters: filters.length,
      });

      const result = await client.collections(COLLECTION_NAME).documents().search(searchParams);

      // Reset circuit breaker on success
      TypesenseBreaker.recordSuccess();

      const latency = Date.now() - tStart;
      await MetricsService.trackSearch(latency, result.found, false);

      console.log('[SearchService] ✅ Typesense succeeded', {
        found: result.found,
        latencyMs: latency,
      });

      return {
        results: result.hits?.map((h: any) => h.document as any) || [],
        totalCount: result.found,
        hasMore: result.found > page * limit,
        source: 'typesense',
        latencyMs: latency,
      };
    } catch (error: any) {
      // Record failure and trip circuit breaker if needed
      TypesenseBreaker.recordFailure();
      await MetricsService.increment('search_typesense_error');

      console.error('[SearchService] ❌ Typesense search failed:', {
        error: error?.message || error,
        breaker: TypesenseBreaker.getState(),
      });

      return null; // Trigger fallback
    }
  }

  /**
   * Main search orchestrator
   *
   * Priority:
   * 1. Cache (L1/L2)
   * 2. Typesense (if available & breaker not open)
   * 3. Firestore optimized search
   * 4. Snapshot cache fallback
   * 5. Error result
   */
  static async searchPlaces(input: string | SearchOptions, pageNum: number = 1): Promise<SearchResult> {
    const tStart = Date.now();

    // Normalize input
    const options: SearchOptions = typeof input === 'string' ? { query: input, page: pageNum } : input;

    const query = options.query || '';
    const page = Math.max(1, options.page || 1);
    const limit = Math.max(1, Math.min(100, options.limit || 10));

    console.log('[SearchService] Search started', {
      query: query || '(empty)',
      page,
      limit,
    });

    const cacheKey = this.buildCacheKey(options);
    const useRedis = this.isRedisAvailable();

    // 1️⃣ CHECK CACHE FIRST (L1/L2)
    const fetcher = async (): Promise<SearchResult> => {
      // 2️⃣ CHECK CIRCUIT BREAKER
      if (TypesenseBreaker.isOpen()) {
        console.warn('[SearchService] Typesense breaker is OPEN, skipping to Firestore fallback');
        await MetricsService.increment('search_breaker_open');
        return this.fallbackToFirestore(options);
      }

      // 3️⃣ TRY TYPESENSE (if available)
      const typesenseOk = await this.isTypesenseAvailable();
      if (typesenseOk) {
        const result = await this.tryTypesenseSearch(options);
        if (result) {
          return result;
        }
      } else {
        console.info('[SearchService] Typesense not available, skipping to Firestore');
      }

      // 4️⃣ FALLBACK TO FIRESTORE
      return this.fallbackToFirestore(options);
    };

    // Use tiered cache if Redis available, otherwise in-memory cache
    let result: SearchResult;
    if (useRedis) {
      result = await CacheService.get(cacheKey, fetcher, this.REDIS_TTL_SECONDS);
    } else {
      // In-memory fallback
      const cached = GlobalCache.get<SearchResult>(cacheKey);
      if (cached) {
        console.log('[SearchService] Cache HIT (L1)', { cacheKey });
        cached.fromCache = true;
        const latency = Date.now() - tStart;
        return { ...cached, latencyMs: latency };
      }

      result = await fetcher();
      GlobalCache.set(cacheKey, result, this.CACHE_TTL_MS);
    }

    const latency = Date.now() - tStart;
    result.latencyMs = latency;

    console.log('[SearchService] Search completed', {
      source: result.source,
      found: result.totalCount,
      cached: result.fromCache || false,
      latencyMs: latency,
    });

    return result;
  }

  /**
   * Fallback strategy: Firestore optimized search
   * Uses prefix queries and strict limits (< 20 reads)
   */
  static async fallbackToFirestore(options: SearchOptions): Promise<SearchResult> {
    const tStart = Date.now();

    try {
      console.log('[SearchService] Falling back to Firestore optimized search');

      // Try optimized Firestore search first
      const result = await FallbackHandler.optimizedSearch(options);
      const latency = Date.now() - tStart;

      // Track metrics
      if (result.source === 'firestore') {
        await MetricsService.trackSearch(latency, result.totalCount, true);
        console.log('[SearchService] ✅ Firestore optimized search succeeded', {
          found: result.totalCount,
          latencyMs: latency,
          method: result.method,
        });
        return result;
      }

      // If optimized search failed, try snapshot
      console.warn('[SearchService] Optimized search failed, trying snapshot cache');
      const snapshotResult = await FallbackHandler.fallbackToSnapshot(options);
      snapshotResult.latencyMs = Date.now() - tStart;

      if (snapshotResult.source === 'snapshot') {
        await MetricsService.trackSearch(snapshotResult.latencyMs, snapshotResult.totalCount, true);
        console.log('[SearchService] ✅ Snapshot fallback succeeded', {
          found: snapshotResult.totalCount,
          latencyMs: snapshotResult.latencyMs,
        });
        return snapshotResult;
      }

      // Both failed
      return {
        results: [],
        totalCount: 0,
        hasMore: false,
        source: 'error',
        latencyMs: Date.now() - tStart,
      };
    } catch (error) {
      console.error('[SearchService] Firestore fallback completely failed:', error);
      return {
        results: [],
        totalCount: 0,
        hasMore: false,
        source: 'error',
        latencyMs: Date.now() - tStart,
      };
    }
  }

  /**
   * Invalidate search cache
   * Called when any place is created/updated/deleted
   */
  static async invalidateSearchCache(reason: string = 'mutation'): Promise<void> {
    console.log('[SearchService] Invalidating search caches', { reason });

    // L1 invalidation
    GlobalCache.invalidatePattern('search:');

    // L2 invalidation
    await CacheService.invalidatePrefix('search:');

    console.log('[SearchService] Search cache invalidation complete');
  }

  /**
   * Get cache statistics for monitoring
   */
  static getCacheStats(): {
    l1Keys: string[];
    cachedQueries: number;
  } {
    const l1Keys = GlobalCache.keys().filter((k) => k.startsWith('search:'));

    return {
      l1Keys,
      cachedQueries: l1Keys.length,
    };
  }
}
