import client, {
  COLLECTION_NAME,
  TRAVEL_DESTINATIONS_COLLECTION,
  TYPESENSE_ENABLED,
  USERS_COLLECTION,
  healthCheckTypesense,
} from './typesenseClient';
import { CacheService } from '../cache/CacheService';
import { TypesenseBreaker } from './typesenseBreaker';
import { MetricsService } from '../analytics/MetricsService';
import { getRedis } from '@/lib/server/redis';
import { GlobalCache } from '@/modules/cache/GlobalCache';
import { FallbackHandler, FallbackSearchOptions, FallbackResult } from './FallbackHandler';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import { FieldPath } from 'firebase-admin/firestore';
import { updateSharedPlaceInCache } from '@/lib/server/sharedPlacesCache';
import { SyncService } from './SyncService';

/**
 * SearchOptions - Flexible search configuration
 */
export interface SearchOptions {
  query?: string;
  page?: number;
  limit?: number;
  location?: string;
  category?: string;
  contentFilter?: 'all' | 'photos-added' | 'photos-not-added' | 'recently-updated';
  isActive?: boolean;
  forceRefresh?: boolean;
}

export interface UserSearchOptions {
  query?: string;
  page?: number;
  limit?: number;
  role?: string;
  status?: string;
  forceRefresh?: boolean;
}

export interface TravelDestinationSearchOptions {
  query?: string;
  country?: string;
  cursor?: string;
  page?: number;
  limit?: number;
  forceRefresh?: boolean;
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
  firestoreReads?: number;
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
  private static readonly L1_CACHE_TTL_MS = 120_000; // 2 minutes (in-memory)
  private static readonly L2_CACHE_TTL_SECONDS = 300; // 5 minutes (Redis)
  private static readonly REDIS_MISS_COOLDOWN_MS = 15_000;
  private static readonly REDIS_WRITE_DEDUPE_MS = 30_000;
  private static readonly SEARCH_VERSION_L1_TTL_MS = 5_000;
  private static readonly SEARCH_VERSION_KEY = 'search:version';
  private static redisMissCooldown = new Map<string, number>();
  private static redisWriteCooldown = new Map<string, number>();
  private static cachedSearchVersion: { value: string; expiresAt: number } | null = null;

  // Firestore limits
  private static readonly MAX_FIRESTORE_LIMIT = 100;
  private static readonly SAFE_QUERY_LIMIT = 10;

  // Query timeout
  private static readonly SEARCH_TIMEOUT_MS = 5000;

  // ──────────────────────────────────────────────────────────────────────────
  // MODULAR FUNCTION: Build cache key
  // ──────────────────────────────────────────────────────────────────────────

  static async searchUsers(options: UserSearchOptions = {}): Promise<SearchResult> {
    const tStart = Date.now();
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const query = String(options.query || '').trim();
    const role = options.role || 'all';
    const status = options.status || 'all';
    const cacheKey = await this.buildVersionedCacheKey(
      this.buildScopedCacheKey('users', { query, page, limit, role, status })
    );

    this.logSearchOperation('[SearchService:Users] Search started', {
      query: query || '(empty)',
      page,
      limit,
      role,
      status,
      cacheKey,
      typesenseEnabled: TYPESENSE_ENABLED,
      redisAvailable: this.isRedisAvailable(),
    });

    if (!options.forceRefresh) {
      const cached = this.getFromCache(cacheKey);
      if (cached) return { ...cached, latencyMs: Date.now() - tStart };
    }

    if (!TypesenseBreaker.isOpen() && await this.isTypesenseAvailable()) {
      try {
        const filters: string[] = [];
        if (role !== 'all') filters.push(`role:=${role}`);
        if (status === 'active') filters.push('status:!=inactive');
        if (status === 'inactive') filters.push('status:=inactive');

        const params: any = {
          q: query || '*',
          query_by: 'displayName,email,role,status',
          sort_by: query ? '_text_match:desc,updatedAt:desc' : 'updatedAt:desc',
          per_page: limit,
          page,
        };
        if (filters.length > 0) params.filter_by = filters.join(' && ');

        this.logSearchOperation('[SearchService:Users] Typesense query', {
          collection: USERS_COLLECTION,
          query: params.q,
          query_by: params.query_by,
          filter_by: params.filter_by || '(none)',
          page,
          limit,
        });

        const tsResult = await client.collections(USERS_COLLECTION).documents().search(params);
        TypesenseBreaker.recordSuccess();
        const rows = tsResult.hits?.map((hit: any) => hit.document) || [];
        const result: SearchResult = {
          results: rows,
          totalCount: tsResult.found || rows.length,
          hasMore: (tsResult.found || 0) > page * limit,
          source: 'typesense',
          latencyMs: Date.now() - tStart,
        };
        this.logSearchOperation('[SearchService:Users] Typesense success', {
          query,
          found: result.totalCount,
          latencyMs: result.latencyMs,
        });
        if (result.totalCount > 0 || query === '') {
          this.setCache(cacheKey, result, true);
          return result;
        }
      } catch (error) {
        TypesenseBreaker.recordFailure();
        this.logSearchOperation('[SearchService:Users] Typesense failed, falling back to Firestore', {
          query,
          error: error instanceof Error ? error.message : String(error),
        }, 'warn');
      }
    }

    if (!options.forceRefresh) {
      const redisCached = await this.getFromRedisCache(cacheKey, 'Users', { query });
      if (redisCached) return { ...redisCached, latencyMs: Date.now() - tStart };
    }

    // Cap Firestore reads to avoid large collection scans. For deep pagination
    // require Typesense or cursor-based queries. Use configured MAX_FIRESTORE_LIMIT.
    const fetchLimit = Math.min(this.MAX_FIRESTORE_LIMIT, Math.max(this.SAFE_QUERY_LIMIT, page * limit));
    if (page * limit > this.MAX_FIRESTORE_LIMIT) {
      this.logSearchOperation('[SearchService] Firestore read cap applied, consider using Typesense for deep pages', {
        requested: page * limit,
        cappedAt: fetchLimit,
      }, 'warn');
    }
    const snap = await adminDb.collection('users').orderBy('createdAt', 'desc').limit(fetchLimit).get();
    const normalizedQuery = this.normalizeText(query);
    const rows = snap.docs
      .map((doc: any) => ({ id: doc.id, ...doc.data() }))
      .filter((row: any) => {
        if (role !== 'all' && String(row.role || '').toLowerCase() !== role.toLowerCase()) return false;
        if (status === 'active' && String(row.status || 'active').toLowerCase() === 'inactive') return false;
        if (status === 'inactive' && String(row.status || '').toLowerCase() !== 'inactive') return false;
        if (!normalizedQuery) return true;
        return [
          row.displayName,
          row.displayName_lower,
          row.username,
          row.username_lower,
          row.email,
          row.email_lower,
          row.role,
          row.status,
        ].some((value) => this.normalizeText(value).includes(normalizedQuery));
      });
    const startIdx = (page - 1) * limit;
    const result: SearchResult = {
      results: rows.slice(startIdx, startIdx + limit),
      totalCount: rows.length,
      hasMore: rows.length > startIdx + limit,
      source: 'firestore',
      latencyMs: Date.now() - tStart,
      method: 'bounded-users-fallback',
      firestoreReads: snap.size,
    };
    this.setCache(cacheKey, result);
    this.logSearchOperation('[SearchService:Users] Firestore fallback completed', {
      query,
      docsRead: snap.size,
      found: result.totalCount,
      latencyMs: result.latencyMs,
    });
    // Backfill: enqueue Typesense sync jobs for returned users so future
    // searches hit Typesense instead of falling back to Firestore.
    (async () => {
      try {
        for (const row of result.results) {
          try {
            await SyncService.syncUser(row);
          } catch (err) {
            console.warn('[SearchService] SyncService.syncUser failed for', { id: row?.id, error: err instanceof Error ? err.message : String(err) });
          }
        }
      } catch (err) {
        console.warn('[SearchService] Backfill enqueue failed', { error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return result;
  }

  static async searchTravelDestinations(options: TravelDestinationSearchOptions = {}): Promise<SearchResult & { nextCursor?: string | null }> {
    const tStart = Date.now();
    const query = String(options.query || '').trim();
    const country = String(options.country || '').trim();
    const cursor = String(options.cursor || '').trim();
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const cacheKey = await this.buildVersionedCacheKey(
      this.buildScopedCacheKey('travel-destinations', { query, country, cursor, page, limit })
    );

    this.logSearchOperation('[SearchService:Travel] Search started', {
      query: query || '(empty)',
      country: country || '(any)',
      cursor: cursor || '(none)',
      page,
      limit,
      cacheKey,
      typesenseEnabled: TYPESENSE_ENABLED,
      redisAvailable: this.isRedisAvailable(),
    });

    if (!options.forceRefresh) {
      const cached = this.getFromCache(cacheKey) as (SearchResult & { nextCursor?: string | null }) | null;
      if (cached) return { ...cached, latencyMs: Date.now() - tStart };
    }

    if (!TypesenseBreaker.isOpen() && !cursor && await this.isTypesenseAvailable()) {
      try {
        const params: any = {
          q: [query, country].filter(Boolean).join(' ') || '*',
          query_by: 'place:5,country:3,name_lower:4,location_search:2,location_lower:2,introduction:1,itinerary:1',
          sort_by: query || country ? '_text_match:desc,updatedAt:desc' : 'updatedAt:desc',
          per_page: limit,
          page,
        };

        this.logSearchOperation('[SearchService:Travel] Typesense query', {
          collection: TRAVEL_DESTINATIONS_COLLECTION,
          query: params.q,
          query_by: params.query_by,
          page,
          limit,
        });

        const tsResult = await client.collections(TRAVEL_DESTINATIONS_COLLECTION).documents().search(params);
        TypesenseBreaker.recordSuccess();
        const rows = tsResult.hits?.map((hit: any) => hit.document) || [];
        const result: SearchResult & { nextCursor?: string | null } = {
          results: rows,
          totalCount: tsResult.found || rows.length,
          hasMore: (tsResult.found || 0) > page * limit,
          nextCursor: (tsResult.found || 0) > page * limit ? String(page + 1) : null,
          source: 'typesense',
          latencyMs: Date.now() - tStart,
        };
        this.logSearchOperation('[SearchService:Travel] Typesense success', {
          query,
          country,
          found: result.totalCount,
          latencyMs: result.latencyMs,
        });
        if (result.totalCount > 0 || (!query && !country)) {
          this.setCache(cacheKey, result, true);
          return result;
        }
      } catch (error) {
        TypesenseBreaker.recordFailure();
        this.logSearchOperation('[SearchService:Travel] Typesense failed, falling back to Firestore', {
          query,
          country,
          error: error instanceof Error ? error.message : String(error),
        }, 'warn');
      }
    }

    if (!options.forceRefresh) {
      const redisCached = await this.getFromRedisCache(cacheKey, 'Travel', { query, country });
      if (redisCached) {
        return {
          ...redisCached,
          latencyMs: Date.now() - tStart,
        } as SearchResult & { nextCursor?: string | null };
      }
    }

    const normalizedQuery = this.normalizeText(query);
    const normalizedCountry = this.normalizeText(country);
    const hasFilters = Boolean(normalizedQuery || normalizedCountry);
    const scanLimit = hasFilters ? Math.min(200, Math.max(limit * 4, 50)) : limit;
    let pageQuery: any = adminDb.collection('travel-destinations').orderBy(FieldPath.documentId()).limit(scanLimit);
    if (cursor) pageQuery = pageQuery.startAfter(cursor);

    this.logSearchOperation('[SearchService:Travel] Firestore query', {
      collection: 'travel-destinations',
      strategy: hasFilters ? 'bounded-filter-scan' : 'cursor-page',
      query: query || '(empty)',
      country: country || '(any)',
      cursor: cursor || '(none)',
      readLimit: scanLimit,
    });

    const snap = await pageQuery.get();
    const allRows = snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
    const filteredRows = hasFilters
      ? allRows.filter((row: any) => {
          const matchesQuery = !normalizedQuery || [
            row.place,
            row.country,
            row.name_lower,
            row.location_search,
            row.location_lower,
            row.introduction,
            row.itinerary,
            ...(Array.isArray(row.places) ? row.places : []),
          ].some((value) => this.normalizeText(value).includes(normalizedQuery));
          const matchesCountry = !normalizedCountry || this.normalizeText(row.country).includes(normalizedCountry);
          return matchesQuery && matchesCountry;
        })
      : allRows;
    const rows = filteredRows.slice(0, limit);
    const hasMore = snap.size === scanLimit;
    const nextCursor = hasMore ? snap.docs[snap.docs.length - 1]?.id || null : null;
    const result: SearchResult & { nextCursor?: string | null } = {
      results: rows,
      totalCount: filteredRows.length,
      hasMore,
      nextCursor,
      source: 'firestore',
      latencyMs: Date.now() - tStart,
      method: hasFilters ? 'bounded-travel-filter-scan' : 'travel-cursor-page',
      firestoreReads: snap.size,
    };
    this.setCache(cacheKey, result);
    this.logSearchOperation('[SearchService:Travel] Firestore fallback completed', {
      query,
      country,
      docsRead: snap.size,
      found: result.totalCount,
      returned: rows.length,
      latencyMs: result.latencyMs,
    });
    // Backfill: enqueue Typesense sync jobs for returned travel destinations
    // so Typesense gets updated and future searches avoid Firestore fallback.
    (async () => {
      try {
        for (const row of result.results) {
          try {
            await SyncService.syncTravelDestination(row);
          } catch (err) {
            console.warn('[SearchService] SyncService.syncTravelDestination failed for', { id: row?.id, error: err instanceof Error ? err.message : String(err) });
          }
        }
      } catch (err) {
        console.warn('[SearchService] Backfill enqueue failed', { error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return result;
  }

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

  private static shouldSkipRedisRead(key: string): boolean {
    const blockedUntil = this.redisMissCooldown.get(key) || 0;
    if (blockedUntil > Date.now()) return true;
    if (blockedUntil > 0) this.redisMissCooldown.delete(key);
    return false;
  }

  private static markRedisMiss(key: string) {
    this.redisMissCooldown.set(key, Date.now() + this.REDIS_MISS_COOLDOWN_MS);
  }

  private static shouldSkipRedisWrite(key: string): boolean {
    const blockedUntil = this.redisWriteCooldown.get(key) || 0;
    if (blockedUntil > Date.now()) return true;
    if (blockedUntil > 0) this.redisWriteCooldown.delete(key);
    return false;
  }

  private static markRedisWrite(key: string) {
    this.redisWriteCooldown.set(key, Date.now() + this.REDIS_WRITE_DEDUPE_MS);
  }

  private static async getSearchVersion(): Promise<string> {
    if (this.cachedSearchVersion && this.cachedSearchVersion.expiresAt > Date.now()) {
      return this.cachedSearchVersion.value;
    }

    try {
      const redis = getRedis();
      const version = redis ? await redis.get<string>(this.SEARCH_VERSION_KEY) : null;
      const value = version || '1';
      this.cachedSearchVersion = { value, expiresAt: Date.now() + this.SEARCH_VERSION_L1_TTL_MS };
      return value;
    } catch (error) {
      console.warn('[SearchService] Redis search version read failed, using local version', {
        error: error instanceof Error ? error.message : String(error),
      });
      return this.cachedSearchVersion?.value || '1';
    }
  }

  private static async buildVersionedCacheKey(key: string): Promise<string> {
    const version = await this.getSearchVersion();
    return `${key}:v=${version}`;
  }

  private static async getFromRedisCache(
    key: string,
    scope: string,
    context: Record<string, unknown> = {},
  ): Promise<SearchResult | null> {
    if (!this.isRedisAvailable() || this.shouldSkipRedisRead(key)) {
      return null;
    }

    try {
      const redis = getRedis();
      const raw = redis ? await redis.get<string>(key) : null;
      if (typeof raw === 'string' && raw) {
        const result = JSON.parse(raw) as SearchResult;
        result.fromCache = true;
        result.source = 'redis';
        console.info(`[SearchService:${scope}] Redis cache HIT`, { key, ...context });
        this.setCache(key, result, true);
        return result;
      }

      this.markRedisMiss(key);
      console.info(`[SearchService:${scope}] Redis cache MISS`, { key, ...context });
      return null;
    } catch (error) {
      this.markRedisMiss(key);
      console.warn(`[SearchService:${scope}] Redis cache lookup failed`, {
        key,
        ...context,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
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
    if (!bypassRedis && !this.shouldSkipRedisWrite(key)) {
      try {
        const redis = getRedis();
        if (redis) {
          this.markRedisWrite(key);
          redis
            .set(key, JSON.stringify(result), { ex: this.L2_CACHE_TTL_SECONDS })
            .catch((err) => {
              this.redisWriteCooldown.delete(key);
              console.warn('[SearchService] Redis SET failed, continuing with L1 only', {
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
        if (prefix === 'search:') {
          const nextVersion = await redis.incr(this.SEARCH_VERSION_KEY);
          this.cachedSearchVersion = {
            value: String(nextVersion),
            expiresAt: Date.now() + this.SEARCH_VERSION_L1_TTL_MS,
          };
          this.redisMissCooldown.clear();
          this.redisWriteCooldown.clear();
          console.info('[SearchService] Search cache version bumped (L2/Redis)', {
            version: nextVersion,
          });
        } else {
          await CacheService.invalidatePrefix(prefix);
          console.info('[SearchService] Cache invalidated (L2/Redis)');
        }
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
    const content = options.contentFilter ? `f=${options.contentFilter}` : 'f=all';

    return `search:${q}:p${p}:l${l}:${cat}:${loc}:${active}:${content}`;
  }

  private static normalizeText(value: unknown): string {
    return String(value ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9@._\-\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private static buildScopedCacheKey(scope: string, options: Record<string, unknown>): string {
    const stable = Object.keys(options)
      .sort()
      .map((key) => `${key}=${encodeURIComponent(String(options[key] ?? ''))}`)
      .join(':');
    return `search:${scope}:${stable}`;
  }

  private static logSearchOperation(
    label: string,
    payload: Record<string, unknown>,
    level: 'info' | 'warn' | 'error' = 'info',
  ) {
    const entry = {
      at: new Date().toISOString(),
      ...payload,
    };

    if (level === 'error') console.error(label, entry);
    else if (level === 'warn') console.warn(label, entry);
    else console.info(label, entry);
  }

  private static toMillis(value: any): number {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    if (typeof value === 'object') {
      if (typeof value.toDate === 'function') return value.toDate().getTime();
      if (typeof value.seconds === 'number') {
        return (value.seconds * 1000) + Math.floor((value.nanoseconds || 0) / 1_000_000);
      }
    }
    return 0;
  }

  private static matchesContentFilter(doc: any, filter: SearchOptions['contentFilter']): boolean {
    if (!filter || filter === 'all') return true;

    const mediaCount = Array.isArray(doc.media) ? doc.media.length : Number(doc.mediaCount || 0);
    const hasPhotos = Boolean(doc.coverImage) || mediaCount > 0;

    if (filter === 'photos-added') return hasPhotos;
    if (filter === 'photos-not-added') return !hasPhotos;
    if (filter === 'recently-updated') {
      const updatedAt = this.toMillis(doc.updatedAt);
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      return Boolean(updatedAt && updatedAt >= sevenDaysAgo);
    }

    return true;
  }

  private static applyContentFilter(rows: any[], filter: SearchOptions['contentFilter']): any[] {
    return rows.filter((row) => this.matchesContentFilter(row, filter));
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
        const cat = options.category;
        const capitalized = cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase();
        filters.push(`category:=[${cat}, ${cat.toLowerCase()}, ${capitalized}]`);
      }

      // Build query string
      const effectiveQuery = [query, options.location].filter(Boolean).join(' ').trim() || '*';
      const isExploring = effectiveQuery === '*';

      const searchParams: any = {
        q: effectiveQuery,
        query_by:
          'name:5,name_lower:5,city:3,area:2,state:2,country:2,location_search:1,location_lower:1,description:1,description_lower:1',
        sort_by: isExploring 
          ? 'popularity:desc,updatedAt:desc' 
          : '_text_match:desc,popularity:desc,updatedAt:desc',
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

      const rawResults = result.hits?.map((h: any) => h.document) || [];
      const filteredResults = this.applyContentFilter(rawResults, options.contentFilter);

      return {
        results: filteredResults,
        totalCount: options.contentFilter && options.contentFilter !== 'all' ? filteredResults.length : result.found,
        hasMore: options.contentFilter && options.contentFilter !== 'all' ? false : result.found > page * limit,
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
        contentFilter: options.contentFilter,
        location: options.location,
        isActive: options.isActive,
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

        // Propagate fetched Firestore documents to all caches and indexing systems.
        try {
          // Update shared snapshot & redis shards and invalidate search caches
          for (const doc of result.results || []) {
            try {
              // Best-effort: update in-memory snapshot, redis shards, and search index
              void updateSharedPlaceInCache(doc, 'update');

              // Enqueue Typesense sync job for this place (background worker will process)
              try {
                // Ensure we pass the minimal PlaceSyncData shape
                const placeData = {
                  id: String(doc.id || doc.ID || doc._id),
                  name: doc.name || doc.Name || '',
                  city: doc.city || doc.area || '',
                  state: doc.state || '',
                  country: doc.country || '',
                  popularity: doc.popularity || 0,
                  updatedAt: doc.updatedAt || Date.now(),
                  category: doc.category || 'Other',
                  coverImage: doc.coverImage || doc.image || '',
                  googleMapsUrl: doc.googleMapsUrl || '',
                };
                void SyncService.syncPlace(placeData as any);
              } catch (e) {
                console.warn('[SearchService] Failed to enqueue Typesense sync for doc', { id: doc.id, err: e instanceof Error ? e.message : e });
              }
            } catch (e) {
              console.warn('[SearchService] Failed to propagate Firestore doc to caches', { id: doc.id, err: e instanceof Error ? e.message : e });
            }
          }
        } catch (e) {
          console.warn('[SearchService] Propagation of Firestore results failed', e);
        }

        return {
          results: result.results,
          totalCount: result.totalCount,
          hasMore: result.hasMore,
          source: 'firestore',
          latencyMs: latency,
          method: result.method,
          firestoreReads: result.firestoreReads,
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
          firestoreReads: snapshotResult.firestoreReads || 0,
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
        firestoreReads: 0,
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
        firestoreReads: 0,
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
    const cacheKey = await this.buildVersionedCacheKey(this.buildCacheKey(options));

    // New priority per request: 1) Typesense -> 2) Cache (L1/L2) -> 3) Snapshot -> 4) Firestore
    let result: SearchResult | null = null;

    // 1) Try Typesense first (preferred primary source)
    if (TypesenseBreaker.isOpen()) {
      console.warn('[SearchService] Typesense circuit breaker OPEN, skipping Typesense');
      await MetricsService.increment('search_breaker_open');
    } else {
      const typesenseOk = await this.isTypesenseAvailable();
      if (typesenseOk) {
        result = await this.searchTypesense(options);
        if (result) {
          const latencyTs = Date.now() - tStart;
          console.info('[SearchService] Typesense attempt completed', { found: result.totalCount, latencyMs: latencyTs });
          // If Typesense returned results, cache and return immediately
          if (result.totalCount > 0) {
            this.setCache(cacheKey, result, true);
            return { ...result, latencyMs: latencyTs };
          }
          // If Typesense returned zero results, continue to next layers
        }
      } else {
        console.info('[SearchService] Typesense unavailable, continuing to cache/snapshot');
      }
    }

    // 2) Check caches (L1 then L2)
    if (!options.forceRefresh) {
      const l1Result = this.getFromCache(cacheKey);
      if (l1Result) {
        const latency = Date.now() - tStart;
        console.info('[SearchService] Search completed (L1 cache HIT)', { found: l1Result.totalCount, latencyMs: latency });
        return { ...l1Result, latencyMs: latency };
      }

      const redisCached = await this.getFromRedisCache(cacheKey, 'Places', { query, page, limit });
      if (redisCached) {
        const latency = Date.now() - tStart;
        console.info('[SearchService] Search completed (L2 cache HIT)', { found: redisCached.totalCount, latencyMs: latency });
        return { ...redisCached, latencyMs: latency };
      }
    }

    // 3) Snapshot fallback (zero Firestore reads)
    try {
      const snapshotResult: FallbackResult = await FallbackHandler.fallbackToSnapshot({
        query: options.query,
        page: options.page,
        limit: Math.min(options.limit || 10, this.MAX_FIRESTORE_LIMIT),
        category: options.category,
        contentFilter: options.contentFilter,
        location: options.location,
        isActive: options.isActive,
      });

      if (snapshotResult && snapshotResult.source === 'snapshot' && snapshotResult.totalCount > 0) {
        const latency = Date.now() - tStart;
        this.setCache(cacheKey, { results: snapshotResult.results, totalCount: snapshotResult.totalCount, hasMore: snapshotResult.hasMore, source: 'snapshot', latencyMs: latency }, false);
        console.info('[SearchService] Search completed (snapshot)', { found: snapshotResult.totalCount, latencyMs: latency });
        return { results: snapshotResult.results, totalCount: snapshotResult.totalCount, hasMore: snapshotResult.hasMore, source: 'snapshot', latencyMs: Date.now() - tStart };
      }
    } catch (err) {
      console.warn('[SearchService] Snapshot check failed, proceeding to Firestore', err);
    }

    // 4) Final resort: Firestore (optimized)
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
