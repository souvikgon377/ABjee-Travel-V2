import client, { COLLECTION_NAME, healthCheckTypesense } from './typesenseClient';
import { CacheService } from '../cache/CacheService';
import { TypesenseBreaker } from './typesenseBreaker';
import { MetricsService } from '../analytics/MetricsService';
import { getRedis } from '@/lib/server/redis';
import { GlobalCache } from '@/modules/cache/GlobalCache';
import { FallbackHandler, FallbackSearchOptions, FallbackResult } from './FallbackHandler';

/**
 * SearchOptions - Flexible search configuration
 */
export interface SearchOptions {
  query?: string;
  page?: number;
  limit?: number;
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
  source: 'memory' | 'redis' | 'typesense' | 'firestore' | 'snapshot' | 'error';
  latencyMs: number;
  fromCache?: boolean;
  method?: string;
}

/**
 * SearchService - Production-grade search orchestrator (v2)
 *
 * ============================================================================
 * ARCHITECTURE - 12 STRICT RULES:
 * ============================================================================
 *
 * 1. MULTI-LAYER PRIORITY:
 *    In-memory (30s TTL) → Redis → Typesense → Firestore → Safe Fallback
 *
 * 2. CACHE STRATEGY:
 *    - L1: GlobalCache with TTL (30s), key format: search:${query}:p${page}:l${limit}
 *    - L2: Redis (60s TTL) if available, gracefully disable if unavailable
 *    - No serialization issues; L1 directly stores SearchResult objects
 *
 * 3. CACHE INVALIDATION:
 *    - Pattern-based: "search:*" on any mutation (create/update/delete)
 *    - Clear both L1 (GlobalCache) and L2 (Redis) atomically
 *    - Called via CacheInvalidationService.onMutation() after Firestore writes
 *
 * 4. REAL-TIME CONSISTENCY:
 *    - Force fresh read after mutations (bypass cache once)
 *    - Version validation in cache keys (optional "v" param)
 *    - Re-index in Typesense via background SyncService after writes
 *
 * 5. TYPESENSE HANDLING:
 *    - Skip immediately if unavailable (circuit breaker check first)
 *    - NO RETRY LOOPS on failure; fallback instantly
 *    - Background sync via RecoveryService, not blocking search
 *
 * 6. REDIS HANDLING:
 *    - Try to use if available; silently disable on error (no throws)
 *    - Fallback to L1 cache seamlessly if Redis fails
 *    - Connection pooling handled by getRedis()
 *
 * 7. FIRESTORE OPTIMIZATION:
 *    - NEVER full collection scan; always query with WHERE
 *    - Default: WHERE isActive==true, orderBy updatedAt desc, limit ≤20
 *    - Prefix queries: COMBINE >= and <= with \uf8ff for fast range scan
 *    - Max 20 reads per query; if exceeded, return partial results + error log
 *
 * 8. FALLBACK STRATEGY (STRICT LAYERING):
 *    - Try Typesense first (if available & breaker not open)
 *    - If Typesense fails → FallbackHandler.optimizedSearch() (prefix queries)
 *    - If optimized fails → FallbackHandler.fallbackToSnapshot() (zero reads)
 *    - If snapshot fails → Return empty result with source='error'
 *
 * 9. ERROR HANDLING:
 *    - Catch FAILED_PRECONDITION (missing index); log and fallback gracefully
 *    - No exceptions bubbled; always return SearchResult with source='error'
 *    - Record failures to TypesenseBreaker to prevent cascading
 *
 * 10. PERFORMANCE TARGETS (STRICT):
 *     - Response time: <200ms (including all layers)
 *     - Firestore reads: <20 per query (never full collections)
 *     - Result deduplication: Ensure no duplicates in final array
 *     - Cache hit ratio: Monitor and log for insights
 *
 * 11. LOGGING (STRUCTURED):
 *     - Cache HIT/MISS with source and latency
 *     - Fallback usage with reason and read count
 *     - Firestore read count per query
 *     - Query time breakdown (total, per layer)
 *
 * 12. CLEAN CODE:
 *     - Fully typed: SearchOptions, SearchResult, modular returns
 *     - Modular functions: getFromCache(), setCache(), invalidateCache(),
 *       searchFirestore(), searchTypesense()
 *     - JSDoc on all public methods
 *     - Constants for TTLs, limits, error codes
 *
 * ============================================================================
 */
export class SearchService {
  // TTL constants (milliseconds)
  private static readonly L1_CACHE_TTL_MS = 30_000; // 30 seconds (in-memory)
  private static readonly L2_CACHE_TTL_SECONDS = 60; // 60 seconds (Redis)

  // Firestore limits
  private static readonly MAX_FIRESTORE_LIMIT = 20;
  private static readonly SAFE_QUERY_LIMIT = 10;

  // Query timeout
  private static readonly SEARCH_TIMEOUT_MS = 5000;

  // ──────────────────────────────────────────────────────────────────────────
  // MODULAR FUNCTION: Build cache key
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Build normalized cache key from search options
   * Format: search:${query}:p${page}:l${limit}:${filters}
   * Ensures consistent hashing across all cache layers
   *
   * @param options SearchOptions
   * @returns Normalized cache key string
   */
  private static getFromCache(key: string): SearchResult | null {
    // L1: Try GlobalCache first (fastest)
    const l1Result = GlobalCache.get<SearchResult>(key);
    if (l1Result) {
      console.info('[SearchService] Cache HIT (L1/in-memory)', { key });
      return { ...l1Result, fromCache: true, source: 'memory' };
    }
    return null;
  }

  /**
   * Store result in cache layers (L1 + L2 if Redis available)
   *
   * @param key Cache key
   * @param result SearchResult to cache
   * @param bypassRedis Skip Redis (L2) and use only L1
   */
  private static setCache(key: string, result: SearchResult, bypassRedis: boolean = false): void {
    // L1: Always store in GlobalCache
    GlobalCache.set(key, result, this.L1_CACHE_TTL_MS);
    console.info('[SearchService] Cache SET (L1/in-memory)', { key });

    // L2: Try Redis if available and not bypassed
    if (!bypassRedis) {
      try {
        const redis = getRedis();
        if (redis) {
          redis
            .setex(key, this.L2_CACHE_TTL_SECONDS, JSON.stringify(result))
            .catch((err) => {
              console.warn('[SearchService] Redis SETEX failed, continuing with L1 only', {
                error: err?.message,
              });
            });
          console.info('[SearchService] Cache SET (L2/Redis)', { key });
        }
      } catch (error) {
        // Silently disable Redis; continue with L1
        console.warn('[SearchService] Redis unavailable, using L1 only', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Invalidate cache by key prefix across all layers
   *
   * @param prefix Pattern to invalidate (e.g., "search:")
   */
  static async invalidateCache(prefix: string = 'search:'): Promise<void> {
    console.info('[SearchService] Invalidating cache', { prefix });

    // L1: Pattern invalidation in GlobalCache
    const l1Invalidated = GlobalCache.invalidatePattern(prefix);
    console.info('[SearchService] Cache invalidated (L1/in-memory)', {
      count: l1Invalidated.length,
    });

    // L2: Pattern invalidation in Redis
    try {
      const redis = getRedis();
      if (redis) {
        // Redis doesn't have pattern delete in async mode, so we track manually
        // Note: In production, use SCAN + DEL for large keyspaces
        await CacheService.invalidatePrefix(prefix);
        console.info('[SearchService] Cache invalidated (L2/Redis)');
      }
    } catch (error) {
      console.warn('[SearchService] Redis invalidation failed, L1 cleared only', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // MODULAR FUNCTION: Check service availability
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Runtime check: is Typesense available?
   * Uses health check with timeout to prevent blocking
   *
   * @returns true if Typesense responds within timeout
   */
  private static async isTypesenseAvailable(): Promise<boolean> {
    try {
      const available = await healthCheckTypesense(2000); // 2s timeout
      if (!available) {
        console.warn('[SearchService] Typesense health check failed');
      }
      return available;
    } catch (error) {
      console.error('[SearchService] Typesense availability check threw error:', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Runtime check: is Redis available?
   * Silently returns false if Redis disabled or unavailable
   *
   * @returns true if Redis client is initialized
   */
  private static isRedisAvailable(): boolean {
    try {
      const redis = getRedis();
      return redis !== null;
    } catch {
      return false;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // MODULAR FUNCTION: Build normalized cache key
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Build normalized cache key from search options
   * Format: search:${query}:p${page}:l${limit}:${filters}
   *
   * @param options SearchOptions
   * @returns Normalized cache key string
   */
  private static buildCacheKey(options: SearchOptions): string {
    const q = encodeURIComponent(String(options.query || '').trim().toLowerCase());
    const p = options.page || 1;
    const l = Math.min(options.limit || 10, this.MAX_FIRESTORE_LIMIT);
    const cat = options.category ? `c=${encodeURIComponent(String(options.category))}` : 'c=all';
    const loc = options.location
      ? `loc=${encodeURIComponent(String(options.location).trim().toLowerCase())}`
      : 'loc=any';
    const active = typeof options.isActive === 'boolean' ? `a=${options.isActive ? '1' : '0'}` : 'a=all';

    return `search:${q}:p${p}:l${l}:${cat}:${loc}:${active}`;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // MODULAR FUNCTION: Typesense search layer (Layer 3)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Search via Typesense (Layer 3 priority)
   * Skip immediately on failure; no retries
   *
   * @param options SearchOptions
   * @returns SearchResult or null on failure (to trigger fallback)
   */
  private static async searchTypesense(options: SearchOptions): Promise<SearchResult | null> {
    const tStart = Date.now();

    try {
      const query = String(options.query || '').trim();
      const page = Math.max(1, options.page || 1);
      const limit = Math.min(Math.max(1, options.limit || 10), 100);

      // Build Typesense filter_by
      const filters: string[] = [];
      if (options.isActive !== undefined) {
        filters.push(`isActive:=${options.isActive ? 'true' : 'false'}`);
      }
      if (options.category && options.category !== 'all') {
        filters.push(`category:=${options.category}`);
      }

      // Build query string
      const effectiveQuery = [query, options.location].filter(Boolean).join(' ').trim() || '*';

      const searchParams: any = {
        q: effectiveQuery,
        query_by:
          'name,name_lower,city,area,state,country,location_search,location_lower,description,description_lower',
        sort_by: 'popularity:desc,updatedAt:desc',
        per_page: limit,
        page: page,
      };

      if (filters.length > 0) {
        searchParams.filter_by = filters.join(' && ');
      }

      console.info('[SearchService] Searching Typesense', {
        query: effectiveQuery,
        filters: filters.length,
      });

      const result = await client.collections(COLLECTION_NAME).documents().search(searchParams);

      // Reset circuit breaker on success
      TypesenseBreaker.recordSuccess();

      const latency = Date.now() - tStart;
      await MetricsService.trackSearch(latency, result.found, false);

      console.info('[SearchService] ✅ Typesense search succeeded', {
        found: result.found,
        latencyMs: latency,
      });

      return {
        results: result.hits?.map((h: any) => h.document) || [],
        totalCount: result.found,
        hasMore: result.found > page * limit,
        source: 'typesense',
        latencyMs: latency,
      };
    } catch (error: any) {
      // Record failure and trip circuit breaker
      TypesenseBreaker.recordFailure();
      await MetricsService.increment('search_typesense_error');

      const errorCode = error?.code || error?.statusCode || 'UNKNOWN';
      console.error('[SearchService] ❌ Typesense search failed', {
        error: error?.message || String(error),
        code: errorCode,
        breaker: TypesenseBreaker.getState(),
      });

      return null; // Trigger fallback immediately
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // MODULAR FUNCTION: Firestore search layer (Layer 4)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Fallback to Firestore using FallbackHandler
   * Optimized with prefix queries and strict limits
   *
   * @param options SearchOptions
   * @returns SearchResult from Firestore or snapshot
   */
  private static async searchFirestore(options: SearchOptions): Promise<SearchResult> {
    const tStart = Date.now();

    try {
      console.info('[SearchService] Falling back to Firestore');

      // Convert SearchOptions to FallbackSearchOptions
      const fallbackOptions: FallbackSearchOptions = {
        query: options.query,
        page: options.page,
        limit: Math.min(options.limit || 10, this.MAX_FIRESTORE_LIMIT),
        category: options.category,
        location: options.location,
        isActive: typeof options.isActive === 'boolean' ? options.isActive : true,
      };

      // Try optimized search first (prefix queries)
      const result: FallbackResult = await FallbackHandler.optimizedSearch(fallbackOptions);
      const latency = Date.now() - tStart;

      // Validate result
      if (result && result.source === 'firestore') {
        await MetricsService.trackSearch(latency, result.totalCount, true);
        console.info('[SearchService] ✅ Firestore optimized search succeeded', {
          found: result.totalCount,
          latencyMs: latency,
          method: result.method,
        });

        return {
          results: result.results,
          totalCount: result.totalCount,
          hasMore: result.hasMore,
          source: 'firestore',
          latencyMs: latency,
          method: result.method,
        };
      }

      // If optimized failed, try snapshot fallback (zero reads)
      console.warn('[SearchService] Optimized search failed, trying snapshot fallback');
      const snapshotResult: FallbackResult = await FallbackHandler.fallbackToSnapshot(
        fallbackOptions
      );
      snapshotResult.latencyMs = Date.now() - tStart;

      if (snapshotResult && snapshotResult.source === 'snapshot') {
        await MetricsService.trackSearch(snapshotResult.latencyMs, snapshotResult.totalCount, true);
        console.info('[SearchService] ✅ Snapshot fallback succeeded', {
          found: snapshotResult.totalCount,
          latencyMs: snapshotResult.latencyMs,
        });

        return {
          results: snapshotResult.results,
          totalCount: snapshotResult.totalCount,
          hasMore: snapshotResult.hasMore,
          source: 'snapshot',
          latencyMs: snapshotResult.latencyMs,
          method: snapshotResult.method,
        };
      }

      // Both failed
      console.error('[SearchService] Both Firestore methods failed');
      return {
        results: [],
        totalCount: 0,
        hasMore: false,
        source: 'error',
        latencyMs: Date.now() - tStart,
      };
    } catch (error) {
      const latency = Date.now() - tStart;
      console.error('[SearchService] Firestore fallback exception:', {
        error: error instanceof Error ? error.message : String(error),
        latencyMs: latency,
      });

      return {
        results: [],
        totalCount: 0,
        hasMore: false,
        source: 'error',
        latencyMs: latency,
      };
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PUBLIC API: Main search orchestrator
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Main search orchestrator with multi-layer priority
   *
   * LAYER PRIORITY:
   * 1. In-memory cache (30s TTL)
   * 2. Redis cache (60s TTL, if available)
   * 3. Typesense search (if available & breaker not open)
   * 4. Firestore optimized search
   * 5. Snapshot fallback
   * 6. Error result
   *
   * @param input Search query string or SearchOptions object
   * @param pageNum Page number (1-indexed, default 1)
   * @returns SearchResult with results, metadata, and latency
   */
  static async searchPlaces(input: string | SearchOptions, pageNum: number = 1): Promise<SearchResult> {
    const tStart = Date.now();

    // Normalize input to SearchOptions
    let options: SearchOptions;
    if (typeof input === 'string') {
      // String queries default to active places only
      options = { query: input, page: pageNum, isActive: true };
    } else {
      // Object input: preserve isActive intent (undefined, true, or false)
      options = { ...input };
      // Only set isActive default if not explicitly provided
      if (options.isActive === undefined && typeof input.isActive !== 'boolean') {
        // Don't set a default; let caller control with undefined for "show all"
      }
    }

    const query = options.query || '';
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(Math.max(1, options.limit || 10), this.MAX_FIRESTORE_LIMIT);

    console.info('[SearchService] Search started', {
      query: query || '(empty)',
      page,
      limit,
    });

    // Build cache key
    const cacheKey = this.buildCacheKey(options);

    // ────────────────────────────────────────────────────────────────────────
    // LAYER 1: Try L1 cache (in-memory, fastest)
    // ────────────────────────────────────────────────────────────────────────
    const l1Result = this.getFromCache(cacheKey);
    if (l1Result) {
      const latency = Date.now() - tStart;
      console.info('[SearchService] Search completed (cache HIT)', {
        source: 'memory',
        found: l1Result.totalCount,
        latencyMs: latency,
      });
      return { ...l1Result, latencyMs: latency };
    }

    // ────────────────────────────────────────────────────────────────────────
    // LAYER 2: Try L2 cache (Redis, if available)
    // ────────────────────────────────────────────────────────────────────────
    if (this.isRedisAvailable()) {
      try {
        const redis = getRedis();
        if (redis) {
          const l2Raw = await redis.getex(cacheKey, { ex: this.L2_CACHE_TTL_SECONDS });
          if (typeof l2Raw === 'string' && l2Raw) {
            const l2Result: SearchResult = JSON.parse(l2Raw);
            l2Result.fromCache = true;
            l2Result.source = 'redis';
            const latency = Date.now() - tStart;
            console.info('[SearchService] Cache HIT (L2/Redis)', { latency });

            // Backfill L1
            this.setCache(cacheKey, l2Result, true);
            return { ...l2Result, latencyMs: latency };
          }
        }
      } catch (error) {
        console.warn('[SearchService] L2 cache (Redis) lookup failed, continuing to L3', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // LAYER 3: Check Typesense circuit breaker
    // ────────────────────────────────────────────────────────────────────────
    let result: SearchResult | null = null;

    if (TypesenseBreaker.isOpen()) {
      console.warn('[SearchService] Typesense circuit breaker OPEN, skipping to Firestore');
      await MetricsService.increment('search_breaker_open');
    } else {
      // ────────────────────────────────────────────────────────────────────────
      // LAYER 3: Try Typesense search (if breaker closed)
      // ────────────────────────────────────────────────────────────────────────
      const typesenseOk = await this.isTypesenseAvailable();
      if (typesenseOk) {
        result = await this.searchTypesense(options);
        if (result) {
          // Cache and return
          this.setCache(cacheKey, result);
          const latency = Date.now() - tStart;
          console.info('[SearchService] Search completed (Typesense)', {
            found: result.totalCount,
            latencyMs: latency,
          });
          return { ...result, latencyMs: latency };
        }
      } else {
        console.info('[SearchService] Typesense unavailable, skipping to Firestore');
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // LAYER 4: Fallback to Firestore (optimized or snapshot)
    // ────────────────────────────────────────────────────────────────────────
    result = await this.searchFirestore(options);

    // Cache result (even if empty)
    this.setCache(cacheKey, result);

    const latency = Date.now() - tStart;

    console.info('[SearchService] Search completed', {
      source: result.source,
      found: result.totalCount,
      latencyMs: latency,
      method: result.method || 'default',
    });

    // Performance warning
    if (latency > 200) {
      console.warn('[SearchService] Slow search detected', {
        query,
        latencyMs: latency,
        source: result.source,
      });
    }

    return { ...result, latencyMs: latency };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PUBLIC API: Cache management
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Invalidate search cache on mutations (create/update/delete)
   * Called from CacheInvalidationService.onMutation() after Firestore writes
   *
   * @param reason Log reason for invalidation
   */
  static async invalidateSearchCache(reason: string = 'mutation'): Promise<void> {
    console.info('[SearchService] Invalidating search caches', { reason });
    await this.invalidateCache('search:');
    console.info('[SearchService] Search cache invalidation complete');
  }

  /**
   * Get cache statistics for monitoring
   * Returns L1 keys matching search: pattern
   *
   * @returns Cache statistics
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

