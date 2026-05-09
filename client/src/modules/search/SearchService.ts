import client, { COLLECTION_NAME } from './typesenseClient';
import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import { getSharedPlacesCache } from '@/lib/server/sharedPlacesCache';
import { CacheService } from '../cache/CacheService';
import { TypesenseBreaker } from './typesenseBreaker';
import { MetricsService } from '../analytics/MetricsService';

export interface SearchOptions {
  query?: string;
  page?: number;
  limit?: number;
  filter?: string;
  location?: string;
  category?: string;
  isActive?: boolean;
}

export interface SearchResult {
  results: any[];
  totalCount: number;
  hasMore: boolean;
  source: 'typesense' | 'firestore' | 'error';
  latencyMs: number;
}

/**
 * SearchService: Main orchestrator for place searches.
 * 
 * Strategy:
 * 1. Check L1/L2 cache (30s/60s) → return cached result
 * 2. Check Circuit Breaker → if open, fall back to Firestore snapshot
 * 3. Try Typesense search → PRIMARY source
 * 4. On Typesense failure → fall back to Firestore snapshot (no live reads)
 * 5. Store result in cache (with negative caching for empty results)
 * 
 * This ensures:
 * - Zero Firestore reads when Typesense works
 * - Graceful degradation when Typesense is down
 * - Fast responses via multi-tier caching
 */
export class SearchService {
  /**
   * Search Tourist Places using Typesense as primary and Firestore snapshot as fallback.
   * Integrates Circuit Breaker and Tiered Caching (L1: 30s in-memory, L2: 60s Redis).
   * 
   * @param input - Query string or SearchOptions object
   * @param pageNum - Page number (1-indexed, default: 1)
   * @returns SearchResult with results, totalCount, hasMore, source (typesense|firestore|error), and latencyMs
   * 
   * @example
   * // Simple query
   * const result = await SearchService.searchPlaces('taj mahal');
   * 
   * // Advanced options
   * const result = await SearchService.searchPlaces({
   *   query: 'taj',
   *   page: 2,
   *   limit: 20,
   *   category: 'monument',
   *   location: 'agra'
   * });
   */
  static async searchPlaces(input: string | SearchOptions, pageNum: number = 1): Promise<SearchResult> {
    const tStart = Date.now();
    
    // Normalize input
    const options: SearchOptions = typeof input === 'string' 
      ? { query: input, page: pageNum } 
      : input;
    
    const query = options.query || '';
    const page = Math.max(1, options.page || 1);
    const limit = Math.max(1, Math.min(100, options.limit || 10)); // Cap at 100
    const queryLower = String(query).toLowerCase().trim();
    
    // Build deterministic, normalized cache key
    const buildCacheKey = (opts: SearchOptions) => {
      const q = encodeURIComponent(String(opts.query || '').trim().toLowerCase());
      const p = opts.page || 1;
      const l = opts.limit || 10;
      const cat = opts.category ? `c=${encodeURIComponent(String(opts.category))}` : 'c=all';
      const loc = opts.location ? `loc=${encodeURIComponent(String(opts.location || '').trim().toLowerCase())}` : '';
      const a = typeof opts.isActive === 'boolean' ? `a=${opts.isActive ? '1' : '0'}` : '';
      return `search:${q}:p${p}:l${l}:${cat}${loc ? ':' + loc : ''}${a ? ':' + a : ''}`;
    };

    const cacheKey = buildCacheKey(options);
    console.log(`[SearchService] Query: "${query}", Page: ${page}, Limit: ${limit}, CacheKey: ${cacheKey}`);

    // 1. Check Cache First (L1/L2)
    return CacheService.get(cacheKey, async () => {
      // 2. Check Circuit Breaker
      if (TypesenseBreaker.isOpen()) {
        console.warn('[SearchService] Circuit breaker is open, falling back to Firestore');
        await MetricsService.increment('search_breaker_open_count');
        return this.fallbackToFirestore(options);
      }

      try {
        // 3. Try Typesense (PRIMARY)
        const filters: string[] = [];
        if (options.isActive !== undefined) filters.push(`isActive:=${options.isActive ? 'true' : 'false'}`);
        if (options.category && options.category !== 'all') filters.push(`category:=${options.category}`);

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

        console.log(`[SearchService] Searching Typesense: ${effectiveQuery === '' ? '*' : effectiveQuery}`);
        const result = await client.collections(COLLECTION_NAME).documents().search(searchParams);
        
        // Success: Reset circuit breaker
        TypesenseBreaker.recordSuccess();
        
        const latency = Date.now() - tStart;
        await MetricsService.trackSearch(latency, result.found, false);
        console.log(`[SearchService] ✅ Typesense found ${result.found} results in ${latency}ms`);

        return {
          results: result.hits?.map((h: any) => h.document as any) || [],
          totalCount: result.found,
          hasMore: result.found > page * limit,
          source: 'typesense' as const,
          latencyMs: latency,
        };
      } catch (error) {
        // Failure: Trip circuit breaker & fall back to Firestore
        TypesenseBreaker.recordFailure();
        await MetricsService.increment('typesense_error_count');
        console.error(`[SearchService] ❌ Typesense error, falling back to Firestore:`, error);
        return this.fallbackToFirestore(options);
      }
    }, 60);
  }

  /**
   * Fallback to the shared Firestore-backed snapshot cache.
   * 
   * This avoids expensive live Firestore scans while still serving accurate results
   * from the source of truth. The snapshot is refreshed periodically in the background.
   * 
   * @param options - Search options
   * @returns SearchResult using firestore source
   */
  static async fallbackToFirestore(options: SearchOptions): Promise<SearchResult> {
    const tStart = Date.now();
    const query = options.query || '';
    const limit = Math.max(1, Math.min(100, options.limit || 10));
    const searchText = [query, options.location].filter(Boolean).join(' ').toLowerCase().trim();

    console.log(`[SearchService] Falling back to Firestore snapshot for: "${searchText || query}"`);

    try {
      const page = Math.max(1, options.page || 1);
      const { places } = await getSharedPlacesCache();
      const dataset = Array.isArray(places) ? places : [];

      // In-memory filtering (NO Firestore reads)
      const filtered = dataset.filter((doc: any) => {
        const isActive = doc.isActive !== false;
        if (options.isActive !== undefined && isActive !== options.isActive) return false;
        if (options.isActive === undefined && !isActive) return false;
        if (options.category && options.category !== 'all' && doc.category !== options.category) return false;

        if (!searchText) return true;

        const fields = [
          doc.name,
          doc.name_lower,
          doc.city,
          doc.state,
          doc.country,
          doc.area,
          doc.location_search,
          doc.location_lower,
          doc.description,
          doc.description_lower,
          doc.searchName,
          doc.searchArea,
          doc.searchState,
          doc.searchCountry,
        ];

        const haystack = fields.map((value) => String(value || '').toLowerCase());
        const tokens = searchText.split(/\s+/).filter(Boolean);
        if (haystack.some((value) => value.includes(searchText))) return true;
        return tokens.length > 0 && tokens.every((token) => haystack.some((value) => value.includes(token)));
      });

      const startIdx = (page - 1) * limit;
      const endIdx = startIdx + limit;
      const paginatedResults = filtered.slice(startIdx, endIdx);
      const latency = Date.now() - tStart;

      await MetricsService.trackSearch(latency, filtered.length, true);
      console.log(`[SearchService] ✅ Firestore snapshot returned ${filtered.length} matches in ${latency}ms`);

      return {
        results: paginatedResults,
        totalCount: filtered.length,
        hasMore: endIdx < filtered.length,
        source: 'firestore' as const,
        latencyMs: latency,
      };
    } catch (error: any) {
      console.warn('[SearchService] Shared snapshot fallback failed, trying bounded prefix query:', error);
      try {
        const page = Math.max(1, options.page || 1);
        const fetchLimit = Math.min(20, Math.max(limit, page * limit));
        const prefixQuery = searchText;

        const runPrefixQuery = async (field: 'name_lower' | 'location_search') => {
          const snap = await adminDb
            .collection('touristPlaces')
            .orderBy(field as any)
            .startAt(prefixQuery)
            .endAt(`${prefixQuery}\uf8ff`) // Unicode trick for prefix match
            .limit(fetchLimit)
            .get();

          return snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
        };

        let candidates: any[] = [];
        if (prefixQuery) {
          const [nameMatches, locationMatches] = await Promise.all([
            runPrefixQuery('name_lower'),
            runPrefixQuery('location_search'),
          ]);
          const map = new Map<string, any>();
          for (const doc of [...nameMatches, ...locationMatches]) map.set(doc.id, doc);
          candidates = [...map.values()];
        }

        const fallbackFiltered = candidates.filter((doc: any) => {
          const isActive = doc.isActive !== false;
          if (options.isActive !== undefined && isActive !== options.isActive) return false;
          if (options.isActive === undefined && !isActive) return false;
          if (options.category && options.category !== 'all' && doc.category !== options.category) return false;
          return true;
        });

        const startIdx = (page - 1) * limit;
        const endIdx = startIdx + limit;
        const paginatedResults = fallbackFiltered.slice(startIdx, endIdx);
        const latency = Date.now() - tStart;

        await MetricsService.trackSearch(latency, fallbackFiltered.length, true);
        console.log(`[SearchService] ✅ Prefix query returned ${fallbackFiltered.length} matches in ${latency}ms`);

        return {
          results: paginatedResults,
          totalCount: fallbackFiltered.length,
          hasMore: endIdx < fallbackFiltered.length,
          source: 'firestore' as const,
          latencyMs: latency,
        };
      } catch (prefixErr) {
        console.error(`[SearchService] ❌ Firestore fallback failed:`, prefixErr);
        return {
          results: [],
          totalCount: 0,
          hasMore: false,
          source: 'error' as const,
          latencyMs: Date.now() - tStart,
        };
      }
    }
  }
}
