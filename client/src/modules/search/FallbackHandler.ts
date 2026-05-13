import { adminDb } from '@/lib/server/firebaseAdminFirestore';
import { GlobalCache } from '@/modules/cache/GlobalCache';
import { MetricsService } from '@/modules/analytics/MetricsService';

export interface FallbackSearchOptions {
  query?: string;
  page?: number;
  limit?: number;
  category?: string;
  location?: string;
  isActive?: boolean;
}

export interface FallbackResult {
  results: any[];
  totalCount: number;
  hasMore: boolean;
  source: 'firestore' | 'snapshot' | 'error';
  latencyMs: number;
  method: 'optimized' | 'prefix' | 'safe';
}

/**
 * FallbackHandler - Multi-layer Firestore fallback strategy
 * 
 * When Typesense is unavailable, this handler provides graceful fallback:
 * 1. Optimized prefix queries on indexed fields (name_lower, location_search)
 * 2. Firestore snapshot cache for instant results
 * 3. Safe limited query (10 docs) as last resort
 * 
 * Handles missing composite indexes gracefully by catching FAILED_PRECONDITION.
 */
export class FallbackHandler {
  private static readonly SAFE_LIMIT = 10;
  private static readonly FETCH_LIMIT = 20;

  /**
   * Detect if error is due to missing composite index
   */
  private static isIndexError(err: any): boolean {
    if (!err) return false;
    const code = err.code || err.status || err.statusCode;
    const msg = String(err.message || err.toString() || '').toLowerCase();
    return (
      code === 9 ||
      code === 'FAILED_PRECONDITION' ||
      /requires an index/.test(msg) ||
      /failed_precondition/.test(msg)
    );
  }

  /**
   * Apply equality filters (category, location, isActive) to query
   */
  private static applyEqualityFilters(ref: any, options: FallbackSearchOptions): any {
    let q = ref;
    if (options.isActive !== undefined) {
      q = q.where('isActive', '==', options.isActive);
    }
    if (options.category && options.category !== 'all') {
      q = q.where('category', '==', options.category);
    }
    if (options.location) {
      q = q.where('city', '==', options.location);
    }
    return q;
  }

  /**
   * Safe limited query fallback (10 docs max)
   * Used when indexes are missing or as last resort
   */
  private static async safeFallbackQuery(
    baseRef: any,
    options: FallbackSearchOptions
  ): Promise<any[]> {
    try {
      const safeRef = this.applyEqualityFilters(baseRef, options).limit(this.SAFE_LIMIT);
      const snap = await safeRef.get();
      const rows = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      console.log('[FallbackHandler] Safe limited query returned results', {
        count: rows.length,
        method: 'safe_limit_10',
      });
      return rows;
    } catch (safeErr) {
      console.error('[FallbackHandler] Safe fallback query failed:', safeErr);
      return [];
    }
  }

  /**
   * Optimized prefix search on indexed fields
   * Uses range operators: field >= query AND field <= query + '\uf8ff'
   */
  private static async runPrefixQuery(
    field: string,
    prefix: string,
    options: FallbackSearchOptions
  ): Promise<any[]> {
    const fetchLimit = Math.min(this.FETCH_LIMIT, options.limit || 20);

    try {
      let qRef: any = adminDb.collection('touristPlaces');
      qRef = this.applyEqualityFilters(qRef, options);
      qRef = qRef
        .where(field, '>=', prefix)
        .where(field, '<=', `${prefix}\uf8ff`)
        .limit(fetchLimit);

      const snap = await qRef.get();
      const results = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

      console.log('[FallbackHandler] Prefix query succeeded', {
        field,
        prefix,
        count: results.length,
      });

      return results;
    } catch (err: any) {
      if (this.isIndexError(err)) {
        console.warn(`[FallbackHandler] Index required for prefix query on ${field}, falling back to safe query`);
        return this.safeFallbackQuery(adminDb.collection('touristPlaces'), options);
      }
      throw err;
    }
  }

  /**
   * Optimized Firestore search using prefix queries
   * Searches across multiple fields and deduplicates
   */
  static async optimizedSearch(options: FallbackSearchOptions): Promise<FallbackResult> {
    const tStart = Date.now();
    const query = String(options.query || '').trim();
    const prefix = query.toLowerCase().trim();
    const page = Math.max(1, options.page || 1);
    const limit = Math.max(1, Math.min(100, options.limit || 10));

    console.log('[FallbackHandler] Starting optimized search', {
      query: prefix || '(empty)',
      page,
      limit,
    });

    try {
      // Direct document access if caller provided an id
      const exactId = (options as any).id;
      if (exactId) {
        try {
          const docSnap = await adminDb.collection('touristPlaces').doc(String(exactId)).get();
          if (!docSnap.exists) {
            return {
              results: [],
              totalCount: 0,
              hasMore: false,
              source: 'firestore',
              latencyMs: Date.now() - tStart,
              method: 'optimized',
            };
          }
          const data = { id: docSnap.id, ...docSnap.data() };
          return {
            results: [data],
            totalCount: 1,
            hasMore: false,
            source: 'firestore',
            latencyMs: Date.now() - tStart,
            method: 'optimized',
          };
        } catch (err) {
          console.error('[FallbackHandler] Direct doc access failed:', err);
          return {
            results: [],
            totalCount: 0,
            hasMore: false,
            source: 'error',
            latencyMs: Date.now() - tStart,
            method: 'optimized',
          };
        }
      }

      // No search prefix: return ordered results by equality filters
      if (!prefix) {
        console.info('[FallbackHandler] Empty query detected, using shared snapshot cache');
        return this.fallbackToSnapshot(options);
      }

      // Prefix search across multiple fields
      const [nameMatches, locationMatches] = await Promise.all([
        this.runPrefixQuery('name_lower', prefix, options),
        this.runPrefixQuery('location_search', prefix, options),
      ]);

      // Deduplicate by id, maintaining first occurrence order
      const seen = new Map<string, any>();
      for (const doc of [...nameMatches, ...locationMatches]) {
        if (!seen.has(doc.id)) {
          seen.set(doc.id, doc);
        }
      }

      let candidates = Array.from(seen.values());

      // Sort by popularity and updatedAt for stable ordering
      candidates.sort((a: any, b: any) => {
        const pa = typeof a.popularity === 'number' ? a.popularity : 0;
        const pb = typeof b.popularity === 'number' ? b.popularity : 0;
        if (pb !== pa) return pb - pa;

        const ua = a.updatedAt || 0;
        const ub = b.updatedAt || 0;
        return ub - ua;
      });

      const startIdx = (page - 1) * limit;
      const endIdx = startIdx + limit;
      const paginatedResults = candidates.slice(startIdx, endIdx);
      const latency = Date.now() - tStart;

      await MetricsService.trackSearch(latency, candidates.length, true);

      return {
        results: paginatedResults,
        totalCount: candidates.length,
        hasMore: endIdx < candidates.length,
        source: 'firestore',
        latencyMs: latency,
        method: 'prefix',
      };
    } catch (err: any) {
      console.error('[FallbackHandler] Optimized search failed:', err);
      return {
        results: [],
        totalCount: 0,
        hasMore: false,
        source: 'error',
        latencyMs: Date.now() - tStart,
        method: 'optimized',
      };
    }
  }

  /**
   * Fallback to shared snapshot cache
   * No Firestore reads - uses pre-cached data
   */
  static async fallbackToSnapshot(options: FallbackSearchOptions): Promise<FallbackResult> {
    const tStart = Date.now();
    const query = options.query || '';
    const limit = Math.max(1, Math.min(100, options.limit || 10));
    const searchText = [query, options.location].filter(Boolean).join(' ').toLowerCase().trim();

    console.log('[FallbackHandler] Falling back to snapshot cache', {
      query: searchText || '(empty)',
    });

    try {
      const { getSharedPlacesCache } = await import('@/lib/server/sharedPlacesCache');
      const { places } = await getSharedPlacesCache();
      const dataset = Array.isArray(places) ? places : [];

      // In-memory filtering (NO additional Firestore reads)
      const filtered = dataset.filter((doc: any) => {
        // Only filter by isActive if explicitly set (true/false)
        // If undefined, show all records (both active and inactive)
        if (options.isActive !== undefined && doc.isActive !== options.isActive) return false;
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

      const page = Math.max(1, options.page || 1);
      const startIdx = (page - 1) * limit;
      const endIdx = startIdx + limit;
      const paginatedResults = filtered.slice(startIdx, endIdx);
      const latency = Date.now() - tStart;

      await MetricsService.trackSearch(latency, filtered.length, true);

      return {
        results: paginatedResults,
        totalCount: filtered.length,
        hasMore: endIdx < filtered.length,
        source: 'snapshot',
        latencyMs: latency,
        method: 'optimized',
      };
    } catch (error) {
      console.error('[FallbackHandler] Snapshot fallback failed:', error);
      return {
        results: [],
        totalCount: 0,
        hasMore: false,
        source: 'error',
        latencyMs: Date.now() - tStart,
        method: 'optimized',
      };
    }
  }
}
